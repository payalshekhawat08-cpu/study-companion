# Answer quality evaluation

Judge used: **RAGAS-style judge**. The installed RAGAS package cannot be imported: No module named 'langchain_community.chat_models.vertexai'

Mode: **dry run**. Gemini calls used: 0 (text calls: 0, query embeddings: 0).

| Question | Faithfulness | Answer relevancy | Context precision | Context recall | Grounded |
|---|---:|---:|---:|---:|---|
| What condition must an array meet before binary search can be used? | 0.95 | 0.90 | 0.90 | 0.95 | yes |
| During a bubble sort pass, what is done when two adjacent elements are in the wrong order? | 0.95 | 0.90 | 0.90 | 0.95 | yes |
| How do hardware and software differ in a computer system? | 0.95 | 0.90 | 0.90 | 0.95 | yes |
| What does supervised machine learning have in its training data that unsupervised learning does not? | 0.95 | 0.90 | 0.90 | 0.95 | yes |
| How does photosynthesis convert sunlight into chemical energy? | 1.00 | 0.90 | 0.00 | 0.00 | no |
| **Average** | **0.96** | **0.90** | **0.72** | **0.76** | — |

Off-topic question: **PASS** (grounded: false).

Real-mode preflight requires up to 6 text calls before starting (daily limit: 20).
