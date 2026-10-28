RESULT: PASS
Date: 2026-10-28
Host: Linux 7.0.0-38-generic, Claude Code 2.1.312
Shape: main session -> probe A (plugin conductor) -> probe B (plugin conductor) -> probe C (general-purpose)
Nonce: e0f3e115-4479-4b6e-aa7d-0e01aaca122c
Evidence: probe A replied `DONE` (its child's reply, relayed from probe C through probe B). The conductor read <marker> back and it held the nonce exactly. Only probe C was told to write the file; probes A and B were told to write nothing. The plugin's <old-name> conductor agent was used for probes A and B.
