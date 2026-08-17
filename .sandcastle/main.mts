// Parallel Planner with Review — four-phase orchestration loop
//
// This template drives a multi-phase workflow:
//   Phase 1 (Plan):             An opus agent analyzes open issues, builds a
//                               dependency graph, and outputs a <plan> JSON
//                               listing unblocked issues with branch names.
//   Phase 2 (Execute + Review): For each issue, a sandbox is created via
//                               createSandbox(). The implementer runs first
//                               (100 iterations). If it produces commits, a
//                               reviewer runs in the same sandbox on the same
//                               branch (1 iteration). All issue pipelines run
//                               concurrently via Promise.allSettled().
//   Phase 3 (Merge):            A single agent merges all completed branches
//                               into the current branch.
//
// The outer loop repeats up to MAX_ITERATIONS times so that newly unblocked
// issues are picked up after each round of merges.
//
// Agents execute in Vercel Firecracker microVMs, so no container engine is
// needed on the host — only Node, to run this file. The orchestrator itself
// (this loop) still runs on your machine: it builds the git worktrees, copies
// them into each sandbox, collects commits, and merges into your local HEAD.
//
// Usage:
//   npx tsx .sandcastle/main.mts
// Or add to package.json:
//   "scripts": { "sandcastle": "npx tsx .sandcastle/main.mts" }

import * as sandcastle from "@ai-hero/sandcastle";
import { vercel } from "@ai-hero/sandcastle/sandboxes/vercel";
import process from "node:process";
import { z } from "zod";

// The planner emits its plan as JSON inside <plan> tags; Output.object extracts
// and validates it against this schema. We use Zod here, but any Standard
// Schema validator works just as well — Valibot, ArkType, etc. See
// https://standardschema.dev.
const planSchema = z.object({
  issues: z.array(
    z.object({ id: z.string(), title: z.string(), branch: z.string() }),
  ),
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Maximum number of plan→execute→merge cycles before stopping.
// Raise this if your backlog is large; lower it for a quick smoke-test run.
const MAX_ITERATIONS = 10;

// Preflight. Vercel credentials are read HOST-side by the @vercel/sandbox SDK,
// so they must be real shell environment variables.
//
// Putting them in .sandcastle/.env is NOT enough: resolveEnv() parses that file
// only to build the env injected *into* the sandbox — it never writes to the
// host's process.env. (.sandcastle/.env stays the right home for
// CLAUDE_CODE_OAUTH_TOKEN and GH_TOKEN, which the agent needs inside the VM.)
if (!process.env.VERCEL_TOKEN && !process.env.VERCEL_OIDC_TOKEN) {
  console.error(
    "Missing Vercel credentials. Export VERCEL_TOKEN (or VERCEL_OIDC_TOKEN when\n" +
      "running on Vercel infrastructure) before starting. These belong in your\n" +
      "shell, not .sandcastle/.env — the SDK runs on the host, not in the sandbox.",
  );
  process.exit(1);
}

// Shared sandbox settings, so planner, implementers, and merger all get
// identical tooling. Called per sandbox — each invocation is a separate microVM.
const sandbox = () =>
  vercel({
    // Token falls back to VERCEL_OIDC_TOKEN / VERCEL_TOKEN from the environment.
    projectId: process.env.VERCEL_PROJECT_ID,
    teamId: process.env.VERCEL_TEAM_ID,
    runtime: "node24",
    // Each vCPU carries 2048 MB. The implementer runs up to 100 iterations of
    // an opus agent plus a test suite, so give it real headroom.
    resources: { vcpus: 4 },
    // Auto-terminate backstop. Must exceed the longest plausible implementer
    // run — a microVM killed mid-run loses uncommitted work. Kept tight rather
    // than generous: if this orchestrator dies, leaked VMs bill until it fires.
    timeout: 60 * 60 * 1000,
  });

// Hooks run inside the sandbox before the agent starts each iteration.
//
// These replace the Dockerfile. Vercel has no image build step — it boots a
// stock `runtime` ("node24") — so everything .sandcastle/Dockerfile bakes in
// must be installed per-sandbox here.
//
// IMPORTANT: the node24 runtime is Amazon Linux 2023 (ID_LIKE="fedora"), NOT
// the Debian base the Dockerfile uses. dnf/yum are present; apt-get is not.
// Verified in a live sandbox:
//   node v24.14.1, git 2.49.0, curl 8.17.0, sudo — all preinstalled
//   jq                — absent; installs from the default dnf repos
//   gh                — absent AND not in the default repos; needs the tarball
//   claude            — installs to ~/.local/bin, which is already on PATH
// Each step is guarded with `command -v`, so it is a no-op once satisfied.
const hooks = {
  sandbox: {
    onSandboxReady: [
      // jq. git and curl already ship with the runtime.
      { command: "command -v jq >/dev/null 2>&1 || sudo dnf install -y -q jq" },
      // GitHub CLI — the prompts use it to read and close issues.
      // Not packaged for Amazon Linux, so pull the official release tarball.
      // Drop this block entirely if your agents never touch GitHub.
      {
        command:
          "command -v gh >/dev/null 2>&1 || (" +
          "GH_VER=$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest " +
          "| grep -o '\"tag_name\": *\"v[^\"]*\"' | head -1 | sed 's/.*\"v//;s/\"//') && " +
          'curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VER}/gh_${GH_VER}_linux_amd64.tar.gz" ' +
          "-o /tmp/gh.tgz && " +
          "sudo tar -xzf /tmp/gh.tgz -C /usr/local --strip-components=1 && " +
          "rm -f /tmp/gh.tgz)",
      },
      // Claude Code CLI — the agent binary itself. install.sh drops it in
      // ~/.local/bin (/home/vercel-sandbox/.local/bin), already on PATH here,
      // so no symlink is needed — unlike the Dockerfile, which has to set
      // ENV PATH explicitly for its /home/agent user.
      {
        command:
          "command -v claude >/dev/null 2>&1 || " +
          "curl -fsSL https://claude.ai/install.sh | bash",
      },
      // Project dependencies. Now the primary install path — see below.
      { command: "npm install" },
    ],
  },
};

// NOTE: copyToWorktree previously carried node_modules in from the host to skip
// a cold npm install. Dropped for Vercel: the provider's copyIn() tars the
// directory host-side, uploads it, and untars in the VM, so a 100MB+
// node_modules becomes a network transfer per sandbox — slower than the
// npm install hook above. Re-add it only if you measure otherwise.

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  // -------------------------------------------------------------------------
  // Phase 1: Plan
  //
  // The planning agent (opus, for deeper reasoning) reads the open issue list,
  // builds a dependency graph, and selects the issues that can be worked in
  // parallel right now (i.e., no blocking dependencies on other open issues).
  //
  // It outputs a <plan> JSON block — Output.object parses and validates it.
  // -------------------------------------------------------------------------
  const plan = await sandcastle.run({
    hooks,
    sandbox: sandbox(),
    name: "planner",
    // One iteration is enough: the planner just needs to read and reason,
    // not write code. (Structured output requires maxIterations: 1.)
    maxIterations: 1,
    // Opus for planning: dependency analysis benefits from deeper reasoning.
    agent: sandcastle.claudeCode("claude-opus-4-8"),
    promptFile: "./.sandcastle/plan-prompt.md",
    // Extract and validate the <plan> JSON into a typed object. Throws
    // StructuredOutputError if the tag is missing, the JSON is malformed, or
    // validation fails — which aborts the loop.
    output: sandcastle.Output.object({ tag: "plan", schema: planSchema }),
  });

  const issues = plan.output.issues;

  if (issues.length === 0) {
    // No unblocked work — either everything is done or everything is blocked.
    console.log("No unblocked issues to work on. Exiting.");
    break;
  }

  console.log(
    `Planning complete. ${issues.length} issue(s) to work in parallel:`,
  );
  for (const issue of issues) {
    console.log(`  ${issue.id}: ${issue.title} → ${issue.branch}`);
  }

  // -------------------------------------------------------------------------
  // Phase 2: Execute + Review
  //
  // For each issue, create a sandbox via createSandbox() so the implementer
  // and reviewer share the same sandbox instance per branch. The implementer
  // runs first; if it produces commits, the reviewer runs in the same sandbox.
  //
  // Promise.allSettled means one failing pipeline doesn't cancel the others.
  // -------------------------------------------------------------------------

  const settled = await Promise.allSettled(
    issues.map(async (issue) => {
      // Renamed from `sandbox` to `sbx` — `sandbox` is now the provider factory.
      const sbx = await sandcastle.createSandbox({
        branch: issue.branch,
        sandbox: sandbox(),
        hooks,
      });

      try {
        // Run the implementer
        const implement = await sbx.run({
          name: "implementer",
          maxIterations: 100,
          agent: sandcastle.claudeCode("claude-opus-4-8"),
          promptFile: "./.sandcastle/implement-prompt.md",
          promptArgs: {
            TASK_ID: issue.id,
            ISSUE_TITLE: issue.title,
            BRANCH: issue.branch,
          },
        });

        // Only review if the implementer produced commits
        if (implement.commits.length > 0) {
          const review = await sbx.run({
            name: "reviewer",
            maxIterations: 1,
            agent: sandcastle.claudeCode("claude-opus-4-8"),
            promptFile: "./.sandcastle/review-prompt.md",
            promptArgs: {
              BRANCH: issue.branch,
            },
          });

          // Merge commits from both runs so the merge phase sees all of them.
          // Each sbx.run() only returns commits from its own run.
          return {
            ...review,
            commits: [...implement.commits, ...review.commits],
          };
        }

        return implement;
      } finally {
        await sbx.close();
      }
    }),
  );

  // Log any agents that threw (network error, sandbox crash, etc.).
  for (const [i, outcome] of settled.entries()) {
    if (outcome.status === "rejected") {
      console.error(
        `  ✗ ${issues[i]!.id} (${issues[i]!.branch}) failed: ${outcome.reason}`,
      );
    }
  }

  // Only pass branches that actually produced commits to the merge phase.
  // An agent that ran successfully but made no commits has nothing to merge.
  const completedIssues = settled
    .map((outcome, i) => ({ outcome, issue: issues[i]! }))
    .filter(
      (entry) =>
        entry.outcome.status === "fulfilled" &&
        entry.outcome.value.commits.length > 0,
    )
    .map((entry) => entry.issue);

  const completedBranches = completedIssues.map((i) => i.branch);

  console.log(
    `\nExecution complete. ${completedBranches.length} branch(es) with commits:`,
  );
  for (const branch of completedBranches) {
    console.log(`  ${branch}`);
  }

  if (completedBranches.length === 0) {
    // All agents ran but none made commits — nothing to merge this cycle.
    console.log("No commits produced. Nothing to merge.");
    continue;
  }

  // -------------------------------------------------------------------------
  // Phase 3: Merge
  //
  // One agent merges all completed branches into the current branch,
  // resolving any conflicts and running tests to confirm everything works.
  //
  // The {{BRANCHES}} and {{ISSUES}} prompt arguments are lists that the agent
  // uses to know which branches to merge and which issues to close.
  // -------------------------------------------------------------------------
  await sandcastle.run({
    hooks,
    sandbox: sandbox(),
    name: "merger",
    maxIterations: 1,
    agent: sandcastle.claudeCode("claude-opus-4-8"),
    promptFile: "./.sandcastle/merge-prompt.md",
    promptArgs: {
      // A markdown list of branch names, one per line.
      BRANCHES: completedBranches.map((b) => `- ${b}`).join("\n"),
      // A markdown list of issue IDs and titles, one per line.
      ISSUES: completedIssues.map((i) => `- ${i.id}: ${i.title}`).join("\n"),
    },
  });

  console.log("\nBranches merged.");
}

console.log("\nAll done.");
