/*
 * AI_BIBLE dashboard source of truth for the visual status board.
 * Updated by: .claude/agents/progress-tracker.md
 * Evidence source: 20_ROADMAP.md (and completed work only).
 */
window.PROGRESS_DATA = {
  lastUpdated: "2026-07-28",
  source: "20_ROADMAP.md",
  summary: {
    foundationReady: 30,
    agentsPrepared: 11,
    schemasReady: 6,
    livePhases: 0,
    totalPhases: 7,
    blockerCount: 1
  },
  headline: {
    eyebrow: "✦ TODAY'S STATUS · 28 JUL 2026",
    title: "ฐานความรู้พร้อมแล้ว<br><strong>ถึงเวลาปลุกเหล่า AI Agent!</strong>",
    note: "สเปก, schema และ agent profile พร้อมใช้งานแล้ว เหลือเริ่ม Phase 0 เพื่อเคลียร์สัญญาข้อมูลกลางก่อนเข้าสู่การสร้างระบบจริง"
  },
  missions: {
    meta: { state: "done", tag: "✓ COMPLETE", note: "อ่านเอกสาร สร้าง agent, schema และ payload ตัวอย่าง" },
    phase0: { state: "wait", tag: "WAITING FOR OK", note: "แก้ชื่อไฟล์ 06 / 18 / 19 และรวม JSON contract" },
    phase1: { state: "wait", tag: "NOT STARTED", note: "วาง PostgreSQL, Redis และ Provider Interface" },
    phase2: { state: "wait", tag: "NOT STARTED", note: "รับข้อมูลอสังหาฯ ตรวจซ้ำ และ extract entity" },
    phase3: { state: "wait", tag: "NOT STARTED", note: "ค้นหาภาพ สร้างบ้าน และผลิตวิดีโอ" },
    phase4: { state: "wait", tag: "NOT STARTED", note: "Overlay, render, caption และ publish" },
    phase5: { state: "wait", tag: "NOT STARTED", note: "Analytics, cost tracker และ recovery workflow" },
    phase6: { state: "wait", tag: "NOT STARTED", note: "ปรับประสิทธิภาพจากข้อมูลจริงสู่ 10k คลิป/เดือน" }
  }
};
