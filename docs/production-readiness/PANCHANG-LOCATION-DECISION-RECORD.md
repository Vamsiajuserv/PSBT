# Panchang Location Decision Record

**Project:** PSBT-Portal (Punjagutta Sai Baba Temple Portal)
**Document Date:** 2026-09-17
**Document Type:** BUSINESS DECISION REQUIRED
**Finding ID:** LOC-001
**Status:** OPEN — AWAITING BUSINESS OWNER DECISION

---

## 1. Purpose

This document records the pending decision regarding the geographic coordinates used for Panchang (Hindu almanac) calculations in the PSBT-Portal application.

**This is a business decision, not a technical decision.**

The engineering team has documented both options below. The business owner must select the appropriate location based on spiritual and traditional considerations.

---

## 2. Current Configuration

### 2.1 Coordinates Currently in Use

| Parameter | Current Value | Source |
|-----------|---------------|--------|
| Location Name | Shirdi, Maharashtra | `app/lunar.py:45` |
| Latitude | 19.7660°N | `app/lunar.py:46` |
| Longitude | 74.4764°E | `app/lunar.py:47` |

### 2.2 Files Containing Location Configuration

| File | Line | Purpose |
|------|------|---------|
| `backend/app/lunar.py` | 46-47 | Primary Panchang calculation |
| `backend/app/routers/prokerala.py` | 47-48 | Prokerala API integration |

### 2.3 Current Behavior

The application calculates all Panchang data (Tithi, Nakshatra, Yoga, Karana, sunrise, sunset, Rahu Kalam, etc.) based on Shirdi, Maharashtra coordinates.

---

## 3. Physical Temple Location

### 3.1 Actual Temple Address

```
Sri Shirdi Sai Baba Temple
Dwarakapuri Colony
Punjagutta, Hyderabad
Telangana, India
PIN: 500082
```

### 3.2 Actual Temple Coordinates

| Parameter | Approximate Value |
|-----------|-------------------|
| Location Name | Punjagutta, Hyderabad |
| Latitude | 17.43°N |
| Longitude | 78.45°E |

### 3.3 Geographic Difference

| Metric | Shirdi | Hyderabad | Difference |
|--------|--------|-----------|------------|
| Latitude | 19.7660°N | 17.43°N | ~2.3° South |
| Longitude | 74.4764°E | 78.45°E | ~3.7° East |
| Straight-line distance | — | — | ~500 km |

---

## 4. Decision Options

### 4.1 Option A — Keep Shirdi Location (Current)

**Use coordinates:** 19.7660°N, 74.4764°E (Shirdi, Maharashtra)

#### Spiritual Rationale

- The temple follows Shirdi Sai Baba tradition
- Aligns Panchang calculations with the original Shirdi Sai Baba Temple
- Devotees observing rituals align with Shirdi timings
- Maintains spiritual connection to Shirdi

#### Technical Implications

- No code changes required
- Sunrise/sunset times will differ from local Hyderabad times by approximately:
  - Sunrise: ~10-15 minutes earlier than local
  - Sunset: ~10-15 minutes later than local
- Rahu Kalam, Yamagandam timings will differ accordingly
- Tithi/Nakshatra transitions calculated for Shirdi longitude

#### Consequences

| Aspect | Impact |
|--------|--------|
| Aarti timings | Based on Shirdi sunrise/sunset |
| Panchang display | Shows Shirdi-based timings |
| Festival timings | Aligned with Shirdi temple |
| Local accuracy | Sunrise/sunset not accurate for Hyderabad |

### 4.2 Option B — Use Hyderabad Location

**Use coordinates:** 17.43°N, 78.45°E (Punjagutta, Hyderabad)

#### Practical Rationale

- Accurate sunrise/sunset for local devotees
- Rahu Kalam matches local time
- Devotees performing home rituals can use accurate local timings
- Standard practice for local temple applications

#### Technical Implications

- Code changes required in two files
- Sunrise/sunset will be accurate for Hyderabad
- Tithi/Nakshatra transitions calculated for Hyderabad longitude
- All time-based Panchang elements adjusted for local position

#### Consequences

| Aspect | Impact |
|--------|--------|
| Aarti timings | Based on local sunrise/sunset |
| Panchang display | Shows Hyderabad-based timings |
| Festival timings | Local calculation |
| Shirdi alignment | Panchang differs from Shirdi temple |

---

## 5. Why Location Matters for Panchang

### 5.1 Sunrise and Sunset

Sunrise and sunset times are calculated based on the observer's geographic position. A location further east sees sunrise earlier.

**Example (approximate):**

| Event | Shirdi (74.47°E) | Hyderabad (78.45°E) | Difference |
|-------|------------------|---------------------|------------|
| Sunrise | 6:15 AM | 6:00 AM | ~15 min |
| Sunset | 6:30 PM | 6:45 PM | ~15 min |

### 5.2 Rahu Kalam and Yamagandam

These inauspicious time periods are calculated as divisions of the day between sunrise and sunset. Different sunrise/sunset times result in different Rahu Kalam periods.

### 5.3 Tithi Transitions

The exact moment a Tithi (lunar day) ends depends on the relative positions of Sun and Moon as observed from a specific location. While the difference is usually small, it can affect whether a particular Tithi is observed on a given calendar day.

### 5.4 Nakshatra and Yoga

Similar to Tithi, these are calculated based on lunar position relative to a geographic observer.

---

## 6. Configuration Change Required

If Option B (Hyderabad) is selected, the following changes would be made:

### 6.1 File: `backend/app/lunar.py`

```python
# Current (lines 45-47):
# Temple location: Shirdi, Maharashtra (Sai Baba Temple)
TEMPLE_LAT = 19.7660  # degrees North
TEMPLE_LON = 74.4764  # degrees East

# Changed to:
# Temple location: Punjagutta, Hyderabad (Sri Shirdi Sai Baba Temple)
TEMPLE_LAT = 17.43    # degrees North
TEMPLE_LON = 78.45    # degrees East
```

### 6.2 File: `backend/app/routers/prokerala.py`

```python
# Current (lines 47-48):
TEMPLE_LAT = 19.7660
TEMPLE_LON = 74.4764

# Changed to:
TEMPLE_LAT = 17.43
TEMPLE_LON = 78.45
```

**Note:** These changes will NOT be made without explicit business owner approval.

---

## 7. Decision Record

### 7.1 Decision

**[ ] Option A — Shirdi (19.7660°N, 74.4764°E)**

**[ ] Option B — Hyderabad (17.43°N, 78.45°E)**

### 7.2 Decision Maker

| Field | Value |
|-------|-------|
| Name | _________________________ |
| Role | _________________________ |
| Date | _________________________ |
| Signature | _________________________ |

### 7.3 Rationale

```
(To be filled by decision maker)




```

---

## 8. Recommendation

**No recommendation is provided.**

This is a spiritual/traditional decision that must be made by the temple management or business owner based on:

1. The temple's alignment with Shirdi traditions
2. Devotee expectations
3. How the Panchang is used (display only vs. ritual timing)
4. Whether local accuracy or Shirdi alignment is more important

---

## 9. Post-Decision Action

After the decision is recorded:

| If Selected | Action |
|-------------|--------|
| Option A (Shirdi) | No code changes. Close LOC-001 as "Retain current configuration" |
| Option B (Hyderabad) | Update coordinates in `lunar.py` and `prokerala.py`. Close LOC-001 |

---

## 10. Related Findings

| ID | Finding | Status |
|----|---------|--------|
| LOC-001 | Panchang location decision required | **OPEN** |

---

**Document Status:** AWAITING DECISION
**Technical Changes:** NOT AUTHORIZED until decision recorded
**Decision Owner:** Temple Management / Business Owner

---

*Generated: 2026-09-17*
*Author: Claude Opus 4.5*
*Status: OPEN — BUSINESS DECISION REQUIRED*
