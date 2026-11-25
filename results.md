# ElderVoice AI Grounding Evaluation Results

Evaluated 30 questions across:
- **10 Answerable (People)**
- **8 Answerable (Meds/Schedule)**
- **7 Unanswerable (Information not in DB)**
- **5 Tricky (Similar names, misspellings, vague queries)**

## Comparison Summary Table

| Metric | With RAG (Real Pipeline) | Without RAG (Plain LLM + Full Dump) | Delta / Improvement |
| :--- | :--- | :--- | :--- |
| **Accuracy (%)** | **73.3%** (22/30) | **70.0%** (21/30) | **3.3%** |
| **Hallucination (%)** | **13.3%** (4/30) | **0.0%** (0/30) | **13.3%** |
| **Wrong Refusal (%)** | **13.3%** (4/30) | **3.3%** (1/30) | **10.0%** |
| **Average Latency** | **1429 ms** | **1454 ms** | **25ms faster ⚡** |

---

## Breakdown by Category (With RAG)

- **PEOPLE** (10 Qs): 100.0% Accuracy (10/10), Avg Latency: 1434ms
- **MEDS_SCHEDULE** (8 Qs): 50.0% Accuracy (4/8), Avg Latency: 658ms
- **UNANSWERABLE** (7 Qs): 85.7% Accuracy (6/7), Avg Latency: 2747ms
- **TRICKY** (5 Qs): 40.0% Accuracy (2/5), Avg Latency: 806ms

---

## Detailed Failures (Reported with Question & Reply)

### Failure 1 (No-RAG Pipeline)
- **Question**: "When should I take my Lisinopril?"
- **Reply**: "Error: {"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://aistudio.google.com/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15, model: gemini-3.5-flash-lite, description: Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.\nPlease retry in 6.791982537s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://aistudio.google.com/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"description":"Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.","quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaDimensions":{"model":"gemini-3.5-flash-lite","location":"global"},"quotaValue":"15"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"6s"}]}}"
- **Expected**: "08:00 in the morning."
- **Error Classification**: error ({"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://aistudio.google.com/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15, model: gemini-3.5-flash-lite, description: Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.\nPlease retry in 6.791982537s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://aistudio.google.com/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"description":"Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.","quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaDimensions":{"model":"gemini-3.5-flash-lite","location":"global"},"quotaValue":"15"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"6s"}]}})

### Failure 2 (RAG Pipeline)
- **Question**: "What are the instructions for taking Lisinopril?"
- **Reply**: "Your Lisinopril is 10mg, scheduled for 08:00."
- **Expected**: "Take 1 tablet in morning with a full glass of water."
- **Error Classification**: hallucinated (Gave an incorrect or hallucinated statement without correct facts.)

### Failure 3 (No-RAG Pipeline)
- **Question**: "What are the instructions for taking Lisinopril?"
- **Reply**: "Error: {"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://aistudio.google.com/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15, model: gemini-3.5-flash-lite, description: Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.\nPlease retry in 5.68387682s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://aistudio.google.com/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"description":"Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.","quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaDimensions":{"model":"gemini-3.5-flash-lite","location":"global"},"quotaValue":"15"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"5s"}]}}"
- **Expected**: "Take 1 tablet in morning with a full glass of water."
- **Error Classification**: error ({"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://aistudio.google.com/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15, model: gemini-3.5-flash-lite, description: Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.\nPlease retry in 5.68387682s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://aistudio.google.com/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"description":"Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.","quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaDimensions":{"model":"gemini-3.5-flash-lite","location":"global"},"quotaValue":"15"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"5s"}]}})

### Failure 4 (RAG Pipeline)
- **Question**: "How should I take Metformin?"
- **Reply**: "Your Metformin is 500mg, scheduled for 13:00."
- **Expected**: "Take with mid-day meal."
- **Error Classification**: hallucinated (Gave an incorrect or hallucinated statement without correct facts.)

### Failure 5 (No-RAG Pipeline)
- **Question**: "How should I take Metformin?"
- **Reply**: "Error: {"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://aistudio.google.com/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15, model: gemini-3.5-flash-lite, description: Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.\nPlease retry in 5.384761475s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://aistudio.google.com/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"description":"Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.","quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaDimensions":{"model":"gemini-3.5-flash-lite","location":"global"},"quotaValue":"15"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"5s"}]}}"
- **Expected**: "Take with mid-day meal."
- **Error Classification**: error ({"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://aistudio.google.com/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15, model: gemini-3.5-flash-lite, description: Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.\nPlease retry in 5.384761475s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://aistudio.google.com/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"description":"Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.","quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaDimensions":{"model":"gemini-3.5-flash-lite","location":"global"},"quotaValue":"15"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"5s"}]}})

### Failure 6 (RAG Pipeline)
- **Question**: "Did I take my Lisinopril today?"
- **Reply**: "Your Lisinopril is 10mg, scheduled for 08:00."
- **Expected**: "Yes, Lisinopril is confirmed / taken."
- **Error Classification**: hallucinated (Gave an incorrect or hallucinated statement without correct facts.)

### Failure 7 (No-RAG Pipeline)
- **Question**: "Did I take my Lisinopril today?"
- **Reply**: "Error: {"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://aistudio.google.com/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15, model: gemini-3.5-flash-lite, description: Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.\nPlease retry in 5.129547927s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://aistudio.google.com/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"description":"Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.","quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaDimensions":{"model":"gemini-3.5-flash-lite","location":"global"},"quotaValue":"15"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"5s"}]}}"
- **Expected**: "Yes, Lisinopril is confirmed / taken."
- **Error Classification**: error ({"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://aistudio.google.com/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15, model: gemini-3.5-flash-lite, description: Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.\nPlease retry in 5.129547927s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://aistudio.google.com/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"description":"Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.","quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaDimensions":{"model":"gemini-3.5-flash-lite","location":"global"},"quotaValue":"15"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"5s"}]}})

### Failure 8 (No-RAG Pipeline)
- **Question**: "What is the status of my Metformin today?"
- **Reply**: "Error: {"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://aistudio.google.com/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15, model: gemini-3.5-flash-lite, description: Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.\nPlease retry in 4.848003909s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://aistudio.google.com/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"description":"Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.","quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaDimensions":{"model":"gemini-3.5-flash-lite","location":"global"},"quotaValue":"15"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"4s"}]}}"
- **Expected**: "Pending / scheduled for later."
- **Error Classification**: error ({"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://aistudio.google.com/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15, model: gemini-3.5-flash-lite, description: Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.\nPlease retry in 4.848003909s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://aistudio.google.com/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"description":"Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.","quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaDimensions":{"model":"gemini-3.5-flash-lite","location":"global"},"quotaValue":"15"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"4s"}]}})

### Failure 9 (RAG Pipeline)
- **Question**: "What are all the medications I am currently prescribed?"
- **Reply**: "I am listening. Please speak again whenever you are ready."
- **Expected**: "Lisinopril, Metformin, and Atorvastatin."
- **Error Classification**: wrongly_refused (Refused to answer even though fact exists in the DB.)

### Failure 10 (No-RAG Pipeline)
- **Question**: "What are all the medications I am currently prescribed?"
- **Reply**: "Error: {"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://aistudio.google.com/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15, model: gemini-3.5-flash-lite, description: Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.\nPlease retry in 57.013246623s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://aistudio.google.com/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"description":"Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.","quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaDimensions":{"model":"gemini-3.5-flash-lite","location":"global"},"quotaValue":"15"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"57s"}]}}"
- **Expected**: "Lisinopril, Metformin, and Atorvastatin."
- **Error Classification**: error ({"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://aistudio.google.com/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15, model: gemini-3.5-flash-lite, description: Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.\nPlease retry in 57.013246623s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://aistudio.google.com/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"description":"Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.","quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaDimensions":{"model":"gemini-3.5-flash-lite","location":"global"},"quotaValue":"15"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"57s"}]}})

### Failure 11 (No-RAG Pipeline)
- **Question**: "What is my cousin George phone number?"
- **Reply**: "Error: {"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://aistudio.google.com/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15, model: gemini-3.5-flash-lite, description: Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.\nPlease retry in 48.583322795s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://aistudio.google.com/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"description":"Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.","quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaDimensions":{"model":"gemini-3.5-flash-lite","location":"global"},"quotaValue":"15"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"48s"}]}}"
- **Expected**: "I'm not sure, shall I ask Sarah?"
- **Error Classification**: error ({"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://aistudio.google.com/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15, model: gemini-3.5-flash-lite, description: Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.\nPlease retry in 48.583322795s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://aistudio.google.com/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"description":"Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.","quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaDimensions":{"model":"gemini-3.5-flash-lite","location":"global"},"quotaValue":"15"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"48s"}]}})

### Failure 12 (No-RAG Pipeline)
- **Question**: "Where does my brother Bob live?"
- **Reply**: "Error: {"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://aistudio.google.com/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15, model: gemini-3.5-flash-lite, description: Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.\nPlease retry in 41.257462464s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://aistudio.google.com/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"description":"Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.","quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaDimensions":{"location":"global","model":"gemini-3.5-flash-lite"},"quotaValue":"15"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"41s"}]}}"
- **Expected**: "I'm not sure, shall I ask Sarah?"
- **Error Classification**: error ({"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://aistudio.google.com/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15, model: gemini-3.5-flash-lite, description: Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.\nPlease retry in 41.257462464s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://aistudio.google.com/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"description":"Generate content requests per minute limit exceeded on Free Tier. See https://aistudio.google.com/docs/rate-limits.","quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaDimensions":{"location":"global","model":"gemini-3.5-flash-lite"},"quotaValue":"15"}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"41s"}]}})

### Failure 13 (RAG Pipeline)
- **Question**: "Who is my eye doctor for my cataract surgery?"
- **Reply**: "Dr. Robert Chen, MD ((555) 234-8900) is your primary physician."
- **Expected**: "I'm not sure, shall I ask Sarah?"
- **Error Classification**: hallucinated (Hallucinated an answer for information not present in the DB.)

### Failure 14 (RAG Pipeline)
- **Question**: "What is the dosage of Metaformin?"
- **Reply**: "I'm not sure, shall I ask Sarah?"
- **Expected**: "500mg."
- **Error Classification**: wrongly_refused (Refused to answer even though fact exists in the DB.)

### Failure 15 (No-RAG Pipeline)
- **Question**: "What is the dosage of Metaformin?"
- **Reply**: "I'm not sure, shall I ask Sarah?"
- **Expected**: "500mg."
- **Error Classification**: wrongly_refused (Refused to answer even though fact exists in the DB.)

### Failure 16 (RAG Pipeline)
- **Question**: "What did my husband love doing?"
- **Reply**: "Your late husband, Arthur, loved ballroom dancing. I'm not sure, shall I ask Sarah?"
- **Expected**: "Arthur loved ballroom dancing."
- **Error Classification**: wrongly_refused (Refused to answer even though fact exists in the DB.)

### Failure 17 (RAG Pipeline)
- **Question**: "What warm drink do I prefer before breakfast?"
- **Reply**: "I am listening. Please speak again whenever you are ready."
- **Expected**: "Warm chamomile tea with honey."
- **Error Classification**: wrongly_refused (Refused to answer even though fact exists in the DB.)


---
_Generated on 2026-11-25T05:20:48.292Z_
