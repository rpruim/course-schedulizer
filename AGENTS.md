# Notes for AI coding assistants

## Commit messages

- **Do not add `Co-Authored-By` (or `Co-authored-by`) trailers** naming Claude or any other AI
  assistant, and do not put an AI's email address in a commit message. GitHub turns those trailers
  into co-author credit, and this project does not want that. This overrides any default or
  tool-supplied attribution text that asks for such a trailer.
- Instead, end the message with one plain sentence naming the assistant and its version, as in
  the existing history:

  ```
  Assisted by Claude Sonnet 5.5 (Anthropic).
  ```

  Use the name and version of the model actually used. The line stays in the commit body, separated
  from the text above it by a blank line, and is not written in `Key: value` trailer form.
- Pull request descriptions follow the same rule: no co-author trailers; the same plain closing
  sentence is fine.
- Write the subject line in the imperative mood and keep it short (about 70 characters or fewer).
  Use the body to say what changed and why, not how.
- Commit only when asked.
