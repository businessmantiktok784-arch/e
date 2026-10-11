# Earth Talk — Scientific Research Methodology & AI Evaluation Framework

## 1. Introduction & Ethical Stance

Earth Talk is a geological citizen-science project designed to support mineral and rock identification education and mapping in Rwanda.

### Essential Scientific Principles:
1. **AI Prediction ≠ Geological Truth**: Artificial intelligence vision models generate *preliminary hypotheses* based on visual surface features. They do not replace laboratory petrographic thin-section analysis, X-ray diffraction (XRD), or X-ray fluorescence (XRF).
2. **AI Confidence ≠ Calibrated Statistical Probability**: A confidence score of "high" reflects model certainty over photographic features, not verified assay grade or mineral abundance.
3. **Expert Determination = Reference Standard**: Expert verification records provide an authoritative qualitative reference label.
4. **Observation Density ≠ Geological Abundance**: The spatial clustering of observations reflects mobile phone penetration, population density, and active citizen participation, not underlying geological deposit volume.

---

## 2. Data Ingestion & Preservation Pipeline

```text
Citizen Photograph (WhatsApp)
       ↓
Pre-screening & Validation (MIME check, size verification 10KB–10MB)
       ↓
Gemini Multimodal Inference (Structured JSON Schema)
       ↓
Immutable AI Record Stored in Supabase (Never overwritten)
       ↓
Independent Expert Verification (Authoritative review saved in separate record)
```

### 2.1 Immutability of Preliminary AI Determinations
When an authorized expert reviews an observation, the original AI preliminary interpretation is **never modified or deleted**. The expert's determination is stored in a separate table (`public.expert_verifications`) linked via foreign key. This separation preserves an untampered benchmark dataset for evaluating computer vision model performance over time.

---

## 3. Data Quality & Completeness Scoring Formula

Every observation is evaluated with a deterministic 0–100 Data Quality Score:

$$\text{Overall Score} = S_{\text{image}} + S_{\text{classification}} + S_{\text{location}} + S_{\text{metadata}} + S_{\text{expert}}$$

Where:
- **$S_{\text{image}}$ (0–25 pts)**:
  - Specimen image attached: +15 pts
  - File size within optimal scientific range (10KB–10MB): +10 pts (else +5 pts)
- **$S_{\text{classification}}$ (0–25 pts)**:
  - Primary category determined (igneous, sedimentary, metamorphic): +10 pts
  - Specific rock name proposed: +5 pts
  - Qualitative confidence assigned: +5 pts
  - Two or more visual petrographic features documented: +5 pts (1 feature: +2 pts)
- **$S_{\text{location}}$ (0–25 pts)**:
  - Valid administrative district identified: +10 pts
  - Administrative sector identified: +5 pts
  - Valid geographic coordinates provided: +10 pts
- **$S_{\text{metadata}}$ (0–15 pts)**:
  - Diagnostic geological reasoning text provided (>20 chars): +5 pts
  - Model limitations identified: +5 pts
  - Geological safety notes included: +5 pts
- **$S_{\text{expert}}$ (0–10 pts)**:
  - Observation verified by authorized expert: +10 pts
  - Observation examined and rejected (valid negative sample): +8 pts
  - Under active expert review: +5 pts
  - Unreviewed raw submission: +2 pts

### Quality Classification Tiers:
- **90–100**: High Completeness
- **70–89**: Good Completeness
- **50–69**: Moderate Completeness
- **0–49**: Low Completeness

---

## 4. AI Model vs Expert Reference Evaluation

Evaluation metrics are computed **strictly** on the subset of observations with completed expert reviews.

### 4.1 Sample Size Adequacy Constraint
To prevent misrepresenting small sample anomalies as statistical trends:
- If fewer than 3 verified specimens exist, precision, recall, and F1 calculations are suppressed, and the system issues an explicit **"Insufficient Sample Size"** notice.

### 4.2 Agreement Metrics
- **Observed Agreement Rate**:
  $$\text{Agreement Rate} = \frac{N_{\text{agree}}}{N_{\text{eligible}}} \times 100\%$$
- **Confusion Matrix**: Maps AI preliminary classification (rows) against expert determination (columns).
- **Per-Class Precision, Recall, and Macro-F1**: Evaluated across primary rock classes (`igneous`, `sedimentary`, `metamorphic`).

### 4.3 Coverage and Provenance Constraints

These metrics are only defined when all of the following hold, and Earth Talk
reports `Not measured` rather than a number when any of them does not:

- **Sufficient samples**: at least three valid reference/prediction pairs.
- **Real specimen images**: predictions must come from actual image bytes. A
  specimen with no retrievable image is failed, never substituted.
- **A single serving model**: if a quota error forces the analysis service onto
  a fallback model mid-run, the pooled figures describe no single model and the
  run is marked `MIXED MODEL RUN` instead of being certified as a validation.
- **Full dataset coverage**: a run stopped by the per-run sample cap is marked
  `PARTIAL RUN` and must not be reported as dataset-wide accuracy.

**No controlled validation has been run to date.** Earth Talk publishes no
accuracy figure, and has no specimen dataset or object-storage imagery available
to produce one.

---

## 5. Known Limitations & Research Caveats

1. **Weathering & Alteration**: Surface weathering rinds, iron staining, and lichen cover frequently obscure fresh cleavage planes and mineral crystal habits in field smartphone photos.
2. **Lighting & Color Variance**: Ambient sunlight, flash shadows, and smartphone sensor color saturation can distort rock identification.
3. **Sampling Bias**: Observations are clustered along roads, populated settlements, and quarry sites. They must never be treated as a uniform random sample of Rwanda's bedrock geology.
