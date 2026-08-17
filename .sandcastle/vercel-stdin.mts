// Vercel sandbox provider with working stdin.
//
// WHY THIS EXISTS
//
// @ai-hero/sandcastle 0.12.0's bundled Vercel provider does not implement the
// `stdin` option that the IsolatedSandboxHandle contract requires:
//
//   SandboxProvider.d.ts, on exec():
//     "When `stdin` is set, the implementation pipes the string to the child
//      process's stdin and closes it. This avoids the Linux 128 KB per-arg
//      limit."
//
// src/sandboxes/vercel.ts accepts only { onLine, cwd, sudo } and drops stdin
// on the floor. The Docker provider implements it correctly.
//
// That matters because Sandcastle launches the agent as:
//
//   claude --print --verbose ... -p -
//
// The trailing `-p -` means "read the prompt from stdin". With stdin dropped,
// the agent receives an EMPTY prompt, replies conversationally ("I'm ready to
// help. What would you like to work on?"), makes no commits, and the planner
// then fails with `StructuredOutputError: tag <plan> not found`. Every agent
// is affected, not just the planner.
//
// THE FIX
//
// @vercel/sandbox's runCommand() has no stdin parameter either, so piping
// through the SDK is not an option. Instead, when stdin is present we write it
// to a file inside the sandbox with writeFiles() and rewrite the command to
// read from that file:
//
//   <command>            ->   cat <tmpfile> | <command>
//
// Going through a file rather than embedding the prompt in the command string
// preserves the very property the contract calls out: prompts are not subject
// to the 128 KB argv limit, and no shell escaping of prompt content is needed.
//
// Everything else mirrors the bundled provider: same VERCEL_REPO_PATH, same
// create-params pass-through, same line-oriented streaming to onLine.
//
// Remove this file and go back to `import { vercel } from
// "@ai-hero/sandcastle/sandboxes/vercel"` once upstream implements stdin.

import { createIsolatedSandboxProvider } from "@ai-hero/sandcastle";
import { Writable } from "node:stream";

// Matches VERCEL_REPO_PATH in the bundled provider's source.
const VERCEL_REPO_PATH = "/vercel/sandbox/workspace";

// Bound on the tail retained per stream, so a long agent run cannot overflow
// V8's max string length. Live output still reaches onLine unbounded.
const MAX_TAIL_CHARS = 64 * 1024;

export interface VercelStdinOptions {
  readonly token?: string;
  readonly projectId?: string;
  readonly teamId?: string;
  readonly runtime?: string;
  readonly resources?: { vcpus: number };
  readonly timeout?: number;
  readonly ports?: number[];
  readonly networkPolicy?: Record<string, unknown>;
  readonly env?: Record<string, string>;
  readonly maxOutputTailChars?: number;
  /**
   * Whether the sandbox survives being stopped. Defaults to FALSE here.
   *
   * Vercel v2 sandboxes are persistent by default, and stopping a persistent
   * sandbox snapshots its filesystem — billed as snapshot storage until it
   * expires (30 days). Sandcastle creates one sandbox per run and never
   * resumes it, so every snapshot is pure waste, and each carries a full
   * node_modules. See upstream PR #882.
   */
  readonly persistent?: boolean;
}

/** Keeps only the last `max` characters pushed. */
class Tail {
  private buf = "";
  constructor(
    private readonly max: number,
    private readonly join: string,
  ) {}
  push(chunk: string) {
    this.buf = this.buf ? this.buf + this.join + chunk : chunk;
    if (this.buf.length > this.max) this.buf = this.buf.slice(-this.max);
  }
  toString() {
    return this.buf;
  }
}

let stdinCounter = 0;

export const vercelWithStdin = (options?: VercelStdinOptions) =>
  createIsolatedSandboxProvider({
    name: "vercel",
    env: options?.env,
    create: async (createOptions: { env: Record<string, string> }) => {
      const maxTail = options?.maxOutputTailChars ?? MAX_TAIL_CHARS;
      const { Sandbox } = await import("@vercel/sandbox");

      const createParams: Record<string, unknown> = {
        env: createOptions.env,
        // Opt out of snapshot-on-stop unless explicitly overridden.
        persistent: options?.persistent ?? false,
      };
      if (options?.token) createParams.token = options.token;
      if (options?.projectId) createParams.projectId = options.projectId;
      if (options?.teamId) createParams.teamId = options.teamId;
      if (options?.runtime) createParams.runtime = options.runtime;
      if (options?.resources) createParams.resources = options.resources;
      if (options?.timeout !== undefined) createParams.timeout = options.timeout;
      if (options?.ports) createParams.ports = options.ports;
      if (options?.networkPolicy)
        createParams.networkPolicy = options.networkPolicy;

      const sandbox = await Sandbox.create(
        createParams as Parameters<typeof Sandbox.create>[0],
      );

      await sandbox.mkDir(VERCEL_REPO_PATH);

      return {
        worktreePath: VERCEL_REPO_PATH,

        exec: async (
          command: string,
          opts?: {
            onLine?: (line: string) => void;
            cwd?: string;
            sudo?: boolean;
            stdin?: string;
          },
        ) => {
          // THE FIX: materialize stdin as a file and pipe it in.
          let finalCommand = command;
          let stdinPath: string | undefined;
          if (opts?.stdin !== undefined) {
            stdinPath = `/tmp/sandcastle-stdin-${process.pid}-${stdinCounter++}`;
            await sandbox.writeFiles([
              { path: stdinPath, content: Buffer.from(opts.stdin, "utf8") },
            ]);
            finalCommand = `cat ${stdinPath} | ${command}`;
          }

          const cleanup = async () => {
            if (!stdinPath) return;
            await sandbox
              .runCommand({ cmd: "sh", args: ["-c", `rm -f ${stdinPath}`] })
              .catch(() => {});
          };

          try {
            if (opts?.onLine) {
              const onLine = opts.onLine;
              const stdoutTail = new Tail(maxTail, "\n");
              const stderrTail = new Tail(maxTail, "");
              let partial = "";

              const stdoutWritable = new Writable({
                write(chunk, _enc, cb) {
                  const text = partial + chunk.toString();
                  const lines = text.split("\n");
                  partial = lines.pop() ?? "";
                  for (const line of lines) {
                    stdoutTail.push(line);
                    onLine(line);
                  }
                  cb();
                },
                final(cb) {
                  if (partial) {
                    stdoutTail.push(partial);
                    onLine(partial);
                    partial = "";
                  }
                  cb();
                },
              });

              const stderrWritable = new Writable({
                write(chunk, _enc, cb) {
                  stderrTail.push(chunk.toString());
                  cb();
                },
              });

              const result = await sandbox.runCommand({
                cmd: "sh",
                args: ["-c", finalCommand],
                cwd: opts?.cwd ?? VERCEL_REPO_PATH,
                stdout: stdoutWritable,
                stderr: stderrWritable,
                ...(opts?.sudo ? { sudo: true } : {}),
              });

              return {
                stdout: stdoutTail.toString(),
                stderr: stderrTail.toString(),
                exitCode: result.exitCode,
              };
            }

            const result = await sandbox.runCommand({
              cmd: "sh",
              args: ["-c", finalCommand],
              cwd: opts?.cwd ?? VERCEL_REPO_PATH,
              ...(opts?.sudo ? { sudo: true } : {}),
            });

            return {
              stdout: await result.stdout(),
              stderr: await result.stderr(),
              exitCode: result.exitCode,
            };
          } finally {
            await cleanup();
          }
        },

        copyIn: async (hostPath: string, sandboxPath: string) => {
          const { execSync } = await import("node:child_process");
          const { readFile, stat, unlink } = await import("node:fs/promises");
          const { tmpdir } = await import("node:os");
          const { join } = await import("node:path");

          const info = await stat(hostPath);
          if (info.isDirectory()) {
            const tarPath = join(tmpdir(), `sandcastle-copyin-${Date.now()}.tar.gz`);
            execSync(`tar -czf "${tarPath}" -C "${hostPath}" .`);
            try {
              const tarContent = await readFile(tarPath);
              const sandboxTarPath = `/tmp/sandcastle-copyin-${Date.now()}.tar.gz`;
              await sandbox.writeFiles([
                { path: sandboxTarPath, content: tarContent },
              ]);
              await sandbox.runCommand({
                cmd: "sh",
                args: [
                  "-c",
                  `mkdir -p "${sandboxPath}" && tar -xzf "${sandboxTarPath}" -C "${sandboxPath}" && rm -f "${sandboxTarPath}"`,
                ],
              });
            } finally {
              await unlink(tarPath).catch(() => {});
            }
          } else {
            const content = await readFile(hostPath);
            await sandbox.writeFiles([{ path: sandboxPath, content }]);
          }
        },

        copyFileOut: async (sandboxPath: string, hostPath: string) => {
          const { mkdir, writeFile } = await import("node:fs/promises");
          const { dirname } = await import("node:path");
          const buffer = await sandbox.readFileToBuffer({ path: sandboxPath });
          if (!buffer) {
            throw new Error(`File not found in Vercel sandbox: ${sandboxPath}`);
          }
          await mkdir(dirname(hostPath), { recursive: true });
          await writeFile(hostPath, buffer);
        },

        close: async () => {
          await sandbox.stop();
        },
      };
    },
  });
