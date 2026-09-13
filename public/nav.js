/*
 * Shared top navigation for every console page.
 *
 * One file rather than the same markup pasted into three HTML pages: adding the next tab
 * has to be a one-line edit here, or the tabs drift apart the first time someone is in a
 * hurry. It injects its own styles but only in terms of the CSS variables the pages
 * already define, so it inherits each page's light/dark theme instead of fighting it.
 *
 * Planned pages are listed but not linked. A tab that navigates nowhere teaches people to
 * distrust the whole bar; a tab visibly marked "เร็วๆ นี้" is a roadmap they can read.
 * See 23_PAGE_STUDIO.md for what each planned tab is meant to become.
 */
(() => {
  const TABS = [
    { href: "/", label: "สายพานผลิต", hint: "รัน engine ทีละขั้น" },
    { href: "/narrate", label: "คลิปพากย์เสียง", hint: "รูปหลายรูป + แคปชั่น → คลิปพากย์ไทย (WF8)" },
    { href: "/wf8b", label: "วิดีโอยึดข้อมูลจริง", hint: "ตรวจรูปก่อน เขียนบทเฉพาะสิ่งที่ยืนยันได้ (WF8b)" },
    { href: "/publish", label: "คิวโพสต์", hint: "ตาราง เพจ และกลุ่ม" },
    { href: "/status", label: "สถานะระบบ", hint: "ตรวจก่อนปล่อยโพสต์" },
    { href: "/library", label: "คลังแปลงที่ดิน", hint: "ทุกแปลงเป็นการ์ด กรองตามจังหวัด/ทำเลได้" },
    { label: "ตัดต่อ + ซับ", hint: "ตัดช่วงว่าง ใส่ซับ แล้ว export ลงโฟลเดอร์", soon: true },
    { label: "ตีเส้นแปลง", hint: "ลากขอบเขตที่ดินบนภาพมุมสูง", soon: true },
  ];

  const css = `
  .mmgs-nav {
    position: sticky; top: 0; z-index: 50;
    background: var(--surface, #111d27);
    border-bottom: 1px solid var(--border, #21313e);
    margin-bottom: 22px;
  }
  .mmgs-nav .inner {
    max-width: 1180px; margin: 0 auto; padding: 0 20px;
    display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
  }
  .mmgs-nav .brand {
    font-weight: 800; font-size: 13px; letter-spacing: .12em; text-transform: uppercase;
    color: var(--accent, #dda062); padding: 12px 0; white-space: nowrap;
  }
  .mmgs-nav ul { list-style: none; display: flex; gap: 2px; margin: 0; padding: 0; flex-wrap: wrap; }
  .mmgs-nav a, .mmgs-nav span.soon {
    display: block; padding: 13px 13px 11px; border-bottom: 2px solid transparent;
    font-size: 13.5px; font-weight: 600; text-decoration: none; white-space: nowrap;
    color: var(--text-3, #6a7f92);
  }
  .mmgs-nav a:hover { color: var(--text, #e2eaf1); }
  .mmgs-nav a[aria-current="page"] {
    color: var(--text, #e2eaf1); border-bottom-color: var(--accent, #dda062);
  }
  .mmgs-nav span.soon { cursor: default; opacity: .62; }
  .mmgs-nav span.soon::after {
    content: "เร็วๆ นี้"; margin-inline-start: 6px; font-size: 10px; font-weight: 700;
    padding: 1px 6px; border-radius: 999px; vertical-align: 1.5px;
    background: var(--surface-2, #16232e); border: 1px solid var(--border, #21313e);
  }
  @media (max-width: 720px) { .mmgs-nav .brand { display: none; } }
  `;

  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // "/index.html" and "/" are the same tab; normalise before comparing.
  const here = location.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "");

  const nav = document.createElement("nav");
  nav.className = "mmgs-nav";
  nav.innerHTML = `<div class="inner">
    <div class="brand">MMGS</div>
    <ul>${TABS.map((t) =>
      t.soon
        ? `<li><span class="soon" title="${t.hint}">${t.label}</span></li>`
        : `<li><a href="${t.href}" title="${t.hint}"${t.href === here ? ' aria-current="page"' : ""}>${t.label}</a></li>`
    ).join("")}</ul>
  </div>`;

  document.body.insertBefore(nav, document.body.firstChild);
})();
