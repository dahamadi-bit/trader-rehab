# TraderRehab Challenge 2 MVP — Testing Checklist

**Dev Server**: http://localhost:3000  
**Started**: `npm run dev`  
**Commits**: 3 commits, 1222 lines of code, 0 TypeScript errors

---

## Quick Tests (5–10 min each)

### ✅ Test 1: Hard Stops Banner Displays
**Do this first — simplest test**

1. Go to http://localhost:3000
2. Login (or skip if redirects)
3. Select an account → Start session
4. Look for yellow/orange banner below **SessionStatus** card that says:
   - "Daily P&L: −0 $ | −1% limit: 500 $ remaining (100%)"

**Expected**: Banner visible, shows daily remaining $  
**Code**: Line 515-520 in `session/page.tsx`

---

### ✅ Test 2: Pause Timer Countdown
**Trigger**: Make 3 trades within 60 seconds, close all

1. Start session → emotion_pick → pre_trade form
2. Make 3 quick trades, close each one (doesn't matter if win/loss)
3. After 3rd trade closes → look for:
   - Orange banner: "⚠️ 30 min mandatory pause active. Next trade in: 29:45"
   - "Ouvrir un trade" button should be **disabled**

4. **Verify timer counts down**: Wait 10 seconds, check banner again
   - Should show "29:35" (5 seconds later)

**Expected**: Pause activates, timer counts down accurately  
**Code**: Line 519-523 in `session/page.tsx`

---

### ✅ Test 3: Two Loss Blocker
**Trigger**: Make 2 losing trades back-to-back

1. Start session
2. Trade 1 → close with LOSS (−100$)
3. Trade 2 → close with LOSS (−100$)
4. Try Trade 3 → **POST-TRADE JOURNAL MODAL APPEARS** with:
   - Control signal badge: "🚩 Control loss?" (etc.)
   - But session might auto-close with message:  
     "2 consecutive losses detected. Session ended."

**Expected**: Can't make 3rd trade OR modal shows warnings  
**Code**: Lines 749-755 in `session/page.tsx`

---

### ✅ Test 4: Post-Trade Journal Modal (MAIN FEATURE)
**Do this test carefully — shows off all the work**

**Steps**:
1. Make a trade → close it (any result)
2. **Modal should pop up** (dark overlay with white box in center):

**Check these elements**:
- [ ] Trade summary at top: Result (Gain/Perte/Neutre), P&L ($), Symbol
- [ ] Control signals (if any): Red badges like "🚩 Revenge trade", "⚠️ Emotion risk"
- [ ] **Emotion picker**: 6 emoji buttons (😌 Calme, ⚡ Excité, 😰 Apeuré, etc.)
- [ ] **When you click emotion**, 3–4 phrases appear below:
  - Example for "Excited": "My excitement was justified", "I got caught up"
- [ ] **Thesis correctness**: 3 buttons (Correcte ✓, Partiellement, Incorrecte ✗)
- [ ] **Reflection field**: Text area asking "Qu'aurais-tu fait différemment?"
- [ ] **Checkbox**: "Je suis perdu de contrôle"
- [ ] **Save button**: Disabled until emotion + thesis selected
- [ ] **Cancel button**: Closes modal

3. **Fill it out**:
   - Click emotion
   - Click or edit phrase (or type custom)
   - Select thesis correctness
   - Type reflection (e.g., "Exit earlier")
   - (Optional) Check "I lost control"
   - Click "Sauvegarder"

4. **Expected**: Modal closes, session returns to idle, ready for next trade

**Code**: `src/components/TradeJournalModal.tsx` (complete component)

---

### ✅ Test 5: Emotion Phrases Match Selection
**Verify phrase templates work**

1. In modal, click emotion = "Frustré" (😤, dark red)
2. **Phrases should be specific to frustration**:
   - Examples: "Previous loss is making me impatient"
   - "I want to get back my loss"
   - "Frustration made me revenge trade"
3. Click different emotion (e.g., "Calme" 😌, green)
4. **Phrases change immediately** to calm-specific

**Expected**: Phrases are contextual, not generic  
**Code**: `src/lib/emotion-phrases.ts` (all phrase templates)

---

### ✅ Test 6: Control Signals Show in Modal
**Trigger**: Trade outside emotional sweet spot (6–9 confidence)

1. Start session → emotion_pick
2. **Select emotion + set confidence to 5 or 10** (outside 6–9 range)
3. Proceed to trade
4. Close trade
5. **Journal modal appears** with warning badge:
   - "⚠️ Emotion outside 6–9 range"

**Expected**: Control signal detected and displayed  
**Code**: `src/components/ControlSignalSummary.tsx`

---

## Database Check (If Supabase is Connected)

After submitting journal modal:

1. Go to Supabase dashboard → `trades` table
2. Find newest trade (timestamp = just now)
3. **Verify these columns are populated**:
   - `emotion_after` = value from your pick (e.g., "calm")
   - `emotion_after_note` = phrase text
   - `thesis_correct` = "yes", "partially", or "no"
   - `reflection_note` = your custom text
   - `control_loss_detected` = true/false (checkbox state)
   - `signal_count` = 0, 1, 2, 3, or 4 (number of flags)

**Expected**: All fields saved correctly

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Dev server won't start | `npm install` then `npm run dev` |
| TypeScript errors | Run `npm run type-check` — should show 0 errors |
| Modal doesn't appear | Check browser console (F12) for JS errors |
| Button stays disabled | Did you select emotion AND thesis? Both required. |
| Pause timer doesn't count down | It updates every 1 second, not always visible |
| Hard stop banner missing | Check if daily loss already exceeded (−1%) |

---

## Success Criteria

✅ **MVP works** if:
- [ ] Hard stop banner appears below SessionStatus
- [ ] Pause timer activates after 3 trades in 60 min
- [ ] Post-trade modal appears and is filled with emotion/thesis/reflection
- [ ] Phrases are contextual to selected emotion
- [ ] Control signals display if detected
- [ ] Modal saves, data appears in Supabase trades table
- [ ] TypeScript compiles (0 errors)

**If all ✅**: Implementation is **complete and functional**.

---

## Code References

| Feature | File | Lines |
|---------|------|-------|
| Hard stops logic | `src/lib/hard-stops.ts` | 1–92 |
| 2-loss blocker | `src/lib/two-loss-blocker.ts` | 1–58 |
| 3-in-1-hour detector | `src/lib/trades-per-hour.ts` | 1–106 |
| Emotion phrases | `src/lib/emotion-phrases.ts` | 1–140 |
| Journal modal UI | `src/components/TradeJournalModal.tsx` | 1–250 |
| Control signals display | `src/components/ControlSignalSummary.tsx` | 1–130 |
| Session integration | `src/app/session/page.tsx` | Multiple sections (see comments) |

---

**Total**: 1222 lines of code, 3 phases, ready for testing 🚀
