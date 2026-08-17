# TASK

Review the code changes on branch `{{BRANCH}}` and improve code clarity, consistency, and maintainability while preserving exact functionality.

# CONTEXT

## Branch diff

<!-- Resolve the base branch locally first, then fall back to origin/. An
     isolated sandbox (Vercel) receives only the issue branch plus remote-
     tracking refs, so {{TARGET_BRANCH}} exists there as
     origin/{{TARGET_BRANCH}}. A bind-mount sandbox (Docker) shares the host
     .git and has it as a local branch. This form works in both. -->

!`BASE=$(git rev-parse --verify -q {{TARGET_BRANCH}} || git rev-parse --verify -q origin/{{TARGET_BRANCH}}); git diff "$BASE"...{{BRANCH}}`

## Commits on this branch

!`BASE=$(git rev-parse --verify -q {{TARGET_BRANCH}} || git rev-parse --verify -q origin/{{TARGET_BRANCH}}); git log "$BASE"..{{BRANCH}} --oneline`

# REVIEW PROCESS

1. **Understand the change**: Read the diff and commits above to understand the intent.

2. **Analyze for improvements**: Look for opportunities to:
   - Reduce unnecessary complexity and nesting
   - Eliminate redundant code and abstractions
   - Improve readability through clear variable and function names
   - Consolidate related logic
   - Remove unnecessary comments that describe obvious code
   - Avoid nested ternary operators - prefer switch statements or if/else chains
   - Choose clarity over brevity - explicit code is often better than overly compact code

3. **Check correctness**:
   - Does the implementation match the intent? Are edge cases handled?
   - Are new/changed behaviours covered by tests?
   - Are there unsafe casts, `any` types, or unchecked assumptions?
   - Does the change introduce injection vulnerabilities, credential leaks, or other security issues?

4. **Maintain balance**: Avoid over-simplification that could:
   - Reduce code clarity or maintainability
   - Create overly clever solutions that are hard to understand
   - Combine too many concerns into single functions or components
   - Remove helpful abstractions that improve code organization
   - Make the code harder to debug or extend

5. **Apply project standards**: Follow the coding standards defined in @.sandcastle/CODING_STANDARDS.md

6. **Preserve functionality**: Never change what the code does - only how it does it. All original features, outputs, and behaviors must remain intact.

# EXECUTION

If you find improvements to make:

1. Make the changes directly on this branch
2. Run tests and type checking to ensure nothing is broken
3. Commit describing the refinements

If the code is already clean and well-structured, do nothing.

Once complete, output <promise>COMPLETE</promise>.
