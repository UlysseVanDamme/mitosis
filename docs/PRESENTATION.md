# How we present Mitosis

## What people should remember
Nobody has to go looking for contradictions. The swarm finds them while it reads and tells the person who owns the answer.

## The user flow
The app used to wait for a question, which hid the best part. The flow now starts with what the swarm already found.

1. Sofie logs in. The login screen shows four people rather than roles: Sofie (payroll consultant), Jan Peeters (owner of PC 200), the HR admin of Brouwerij Van Dessel, and the knowledge desk. We log in before the pitch, so the audience never sees this screen.
2. Sofie lands on her handover. She has just taken over the Brouwerij Van Dessel portfolio, and before she types anything the screen says "3 things you should know about Van Dessel". Each line is a contradiction the swarm caught, written plainly: "Two sources disagree on the January index: 2.13% (forecast, October) and 2.21% (final, December)."
3. One click shows the evidence. The cell holding that knowledge turns red, the two sources slide out next to each other, and a single line says which one wins and why.
4. Then she asks: "What indexation should Van Dessel apply in January and February?" The answer is two lines long. Under it are three checks (official source, applies to this client, owner known), one warning about what was ignored, and the answer a plain chatbot gave, crossed out.
5. Jan settles what only he can settle. We switch to Jan. His cell says "3 to decide". He opens one, sees both sides and what depends on it ("Softwarehuis Delta's payroll config still uses 2.13%"), and clicks Verify. The cell turns green.
6. Sofie asks the same question again and gets an instant answer, marked as verified by Jan.
7. Van Dessel's HR admin logs in and asks the same thing. It works, and nothing about other clients appears.

## The pitch (under 3 minutes, the space bar drives the replay)

| Time | On screen | What we say |
|---|---|---|
| 0:00 | Black screen, one line: "Three documents. Three answers." | "Sofie just inherited the Brouwerij Van Dessel portfolio, and the first client question is already waiting: what indexation in January? Her search finds three documents and a Teams message. They say 2.13%, 2.21% and 'February'." |
| 0:20 | One cell, documents flowing in | "So we built something that reads everything first. It starts as one agent, and when it knows too much to keep in mind at once, it divides like a cell." |
| 0:40 | Cells dividing, one line per split | "It splits by joint committee, by client and by country, and it writes down why. Nobody drew this map by hand." |
| 1:00 | Red flash, two sources side by side | "Each specialist keeps its whole domain in view, so it notices when two sources disagree while it is still reading. Here it's a forecast of 2.13% against the final 2.21%." |
| 1:20 | Sofie's handover screen | "When Sofie opens her portfolio, she doesn't start by searching. She starts with what she needs to know." |
| 1:40 | Answer card | "Now she asks. The answer is 2.21%, but for Van Dessel only from 1 February, because their company agreement says so. It shows why it trusts that, what it ignored and who owns the rule. A regular chatbot said 2.13%." |
| 2:05 | Jan's cell, Verify, cell turns green | "Jan owns PC 200. The swarm sends him the questions only he can settle, and shows what they affect: one client config still uses the old number. He confirms it, and from then on everyone gets the verified answer." |
| 2:25 | Three numbers on a dark slide | "We tested it on 102 documents with planted contradictions: [eval numbers]. Client data stays with the client, and a document that tries to give the AI instructions gets quarantined." |
| 2:40 | Closing line | "SD Worx already has agents that find information. Mitosis is what lets people trust what they find. Find it. Understand it. Trust it." |

## Who does what
The presenter tells Sofie's story and never says "agent", "token" or "embedding". The driver presses space, switches to Jan at 2:05 and stays quiet. The Q&A lead takes the technical questions.

## Questions we expect
"Isn't this just RAG with extra steps?" RAG compares a handful of snippets at the moment you ask. Mitosis compares everything related at the moment it reads, so the contradiction is known before anyone asks.

"Who keeps the map up to date?" The swarm does. It divides when a specialist gets too full and grows a new branch when a document fits nowhere. People only confirm the contradictions that need a human.

"What if it picks the wrong winner?" It shows both sides and the rule it applied: final beats forecast, newer beats older, a client agreement beats the sector rule for that client. Anything it can't settle goes to the owner.

"What does it cost?" Facts are extracted once, when a document arrives. Most routing is vector math without an AI call.
