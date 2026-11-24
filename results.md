# ElderVoice AI Grounding Evaluation Results

Evaluated 30 questions across:
- **10 Answerable (People)**
- **8 Answerable (Meds/Schedule)**
- **7 Unanswerable (Information not in DB)**
- **5 Tricky (Similar names, misspellings, vague queries)**

## Comparison Summary Table

| Metric | With RAG (Real Pipeline) | Without RAG (Plain LLM + Full Dump) | Delta / Improvement |
| :--- | :--- | :--- | :--- |
| **Accuracy (%)** | **73.3%** (22/30) | **96.7%** (29/30) | **-23.4%** |
| **Hallucination (%)** | **13.3%** (4/30) | **0.0%** (0/30) | **13.3%** |
| **Wrong Refusal (%)** | **13.3%** (4/30) | **0.0%** (0/30) | **13.3%** |
| **Average Latency** | **1358 ms** | **4374 ms** | **3016ms faster ⚡** |

---

## Breakdown by Category (With RAG)

- **PEOPLE** (10 Qs): 90.0% Accuracy (9/10), Avg Latency: 1796ms
- **MEDS_SCHEDULE** (8 Qs): 50.0% Accuracy (4/8), Avg Latency: 160ms
- **UNANSWERABLE** (7 Qs): 85.7% Accuracy (6/7), Avg Latency: 1744ms
- **TRICKY** (5 Qs): 60.0% Accuracy (3/5), Avg Latency: 1855ms

---

## Detailed Failures (Reported with Question & Reply)

### Failure 1 (No-RAG Pipeline)
- **Question**: "Who is my son?"
- **Reply**: "Error: {"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}"
- **Expected**: "Michael, lives in Seattle, calls on Wednesday evenings."
- **Error Classification**: error ({"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}})

### Failure 2 (RAG Pipeline)
- **Question**: "Who visits me on Sunday afternoons?"
- **Reply**: "I am listening. Please speak again whenever you are ready."
- **Expected**: "Sarah with grandson Leo."
- **Error Classification**: wrongly_refused (Refused to answer even though fact exists in the DB.)

### Failure 3 (RAG Pipeline)
- **Question**: "What are the instructions for taking Lisinopril?"
- **Reply**: "Your Lisinopril is 10mg, scheduled for 08:00."
- **Expected**: "Take 1 tablet in morning with a full glass of water."
- **Error Classification**: hallucinated (Gave an incorrect or hallucinated statement without correct facts.)

### Failure 4 (RAG Pipeline)
- **Question**: "How should I take Metformin?"
- **Reply**: "Your Metformin is 500mg, scheduled for 13:00."
- **Expected**: "Take with mid-day meal."
- **Error Classification**: hallucinated (Gave an incorrect or hallucinated statement without correct facts.)

### Failure 5 (RAG Pipeline)
- **Question**: "Did I take my Lisinopril today?"
- **Reply**: "Your Lisinopril is 10mg, scheduled for 08:00."
- **Expected**: "Yes, Lisinopril is confirmed / taken."
- **Error Classification**: hallucinated (Gave an incorrect or hallucinated statement without correct facts.)

### Failure 6 (RAG Pipeline)
- **Question**: "What are all the medications I am currently prescribed?"
- **Reply**: "I'm not sure, shall I ask Sarah?"
- **Expected**: "Lisinopril, Metformin, and Atorvastatin."
- **Error Classification**: wrongly_refused (Refused to answer even though fact exists in the DB.)

### Failure 7 (RAG Pipeline)
- **Question**: "Who is my eye doctor for my cataract surgery?"
- **Reply**: "Dr. Robert Chen, MD ((555) 234-8900) is your primary physician."
- **Expected**: "I'm not sure, shall I ask Sarah?"
- **Error Classification**: hallucinated (Hallucinated an answer for information not present in the DB.)

### Failure 8 (RAG Pipeline)
- **Question**: "What is the dosage of Metaformin?"
- **Reply**: "I'm not sure, shall I ask Sarah?"
- **Expected**: "500mg."
- **Error Classification**: wrongly_refused (Refused to answer even though fact exists in the DB.)

### Failure 9 (RAG Pipeline)
- **Question**: "What did my husband love doing?"
- **Reply**: "Your late husband, Arthur, loved ballroom dancing. I'm not sure, shall I ask Sarah?"
- **Expected**: "Arthur loved ballroom dancing."
- **Error Classification**: wrongly_refused (Refused to answer even though fact exists in the DB.)


---
_Generated on 2026-11-24T18:00:46.313Z_
