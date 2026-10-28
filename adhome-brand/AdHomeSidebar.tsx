import { type ReactNode, useState } from "react";
import "./AdHomeSidebar.css";

type NavItem = { id: string; label: string; icon: string; count?: number };

const navItems: NavItem[] = [
  { id: "dashboard", label: "Tổng quan", icon: "dashboard" },
  { id: "buildings", label: "Tòa nhà / Phòng", icon: "building" },
  { id: "customers", label: "Khách hàng", icon: "users" },
  { id: "contracts", label: "Hợp đồng", icon: "document" },
  { id: "billing", label: "Hóa đơn", icon: "billing", count: 4 },
  { id: "payments", label: "Thanh toán", icon: "wallet" },
  { id: "reports", label: "Báo cáo", icon: "chart" },
  { id: "settings", label: "Cài đặt", icon: "settings" },
];

function NavIcon({ name }: { name: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="15" width="7" height="6" rx="1.5"/></>,
    building: <><rect x="4" y="3" width="12" height="18" rx="2"/><path d="M16 9h4v12H4"/><path d="M8 7h1m3 0h1M8 11h1m3 0h1M8 15h1m3 0h1"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2"/><path d="M17 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v1"/></>,
    document: <><path d="M6 2h8l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v6h5M8 12h8M8 16h8"/></>,
    billing: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/></>,
    wallet: <><rect x="3" y="6" width="18" height="15" rx="2"/><path d="M3 10h18M7 3h11"/><path d="M16 15h2"/></>,
    chart: <><path d="M4 20V4M4 20h17M8 15l4-5 4 3 4-7"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M10 2h4l.5 2.6 2 1.2 2.5-1 2 3.5-2 1.6v2.3l2 1.6-2 3.5-2.5-1-2 1.2L14 20h-4l-.5-2.6-2-1.2-2.5 1-2-3.5 2-1.6V9.8L3 8.2l2-3.5 2.5 1 2-1.2Z"/></>,
  };
  return <svg className="ad-nav-icon" viewBox="0 0 24 24" aria-hidden="true" {...common}>{paths[name] || paths.dashboard}</svg>;
}

export default function AdHomeSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [active, setActive] = useState("dashboard");
  const currentPage = navItems.find(item => item.id === active)?.label ?? "Tổng quan";

  return (
    <div className={`ad-shell ${collapsed ? "ad-shell--collapsed" : ""} ${mobileOpen ? "ad-shell--mobile-open" : ""}`}>
      <button aria-label="Đóng menu" className="ad-mobile-overlay" onClick={() => setMobileOpen(false)} />
      <aside className="ad-sidebar" aria-label="Menu chính">
        <div className="ad-brand-row">
          <a href="/" className="ad-brand" aria-label="AdHome - trang chủ">
            <img className="ad-brand-full" src="/brand/adhome-logo-full.svg" alt="AdHome" />
            <img className="ad-brand-icon" src="/brand/adhome-icon.svg" alt="" aria-hidden="true" />
          </a>
          <button className="ad-desktop-toggle" type="button" onClick={() => setCollapsed(c => !c)} aria-label={collapsed ? "Mở rộng Sidebar" : "Thu gọn Sidebar"} aria-expanded={!collapsed} title={collapsed ? "Mở rộng Sidebar" : "Thu gọn Sidebar"}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M9 4v16" stroke="currentColor" strokeWidth="1.8" fill="none"/></svg>
          </button>
        </div>
        <div className="ad-nav-caption">QUẢN LÝ VẬN HÀNH</div>
        <nav className="ad-nav">
          {navItems.map(item => (
            <button type="button" key={item.id} className={`ad-nav-item ${active === item.id ? "ad-nav-item--active" : ""}`} title={collapsed ? item.label : undefined} aria-label={item.label} aria-current={active === item.id ? "page" : undefined} onClick={() => { setActive(item.id); setMobileOpen(false); }}>
              <NavIcon name={item.icon}/>
              <span className="ad-nav-label">{item.label}</span>
              {item.count && <span className="ad-nav-count">{item.count}</span>}
            </button>
          ))}
        </nav>
        <div className="ad-sidebar-foot"><span className="ad-avatar">A</span><span className="ad-profile-copy"><b>AdHome Admin</b><small>Quản trị hệ thống</small></span></div>
      </aside>
      <main className="ad-main">
        <header className="ad-topbar">
          <button className="ad-mobile-trigger" aria-label="Mở menu" aria-expanded={mobileOpen} onClick={() => setMobileOpen(v => !v)}>☰</button>
          <strong>{currentPage}</strong>
          <span className="ad-topbar-caption">Hệ thống quản lý AdHome</span>
        </header>
        <div className="ad-page-content">
          <h1>Xin chào từ AdHome <span role="img" aria-label="vẫy tay">👋</span></h1>
          <p>Logo đổi tự động: mở rộng hiển thị biểu tượng + chữ, thu gọn chỉ hiển thị biểu tượng SVG.</p>
          <div className="ad-sample-grid"><div className="ad-sample-card"><small>Tổng phòng</small><strong>128</strong></div><div className="ad-sample-card"><small>Phòng đang thuê</small><strong>96</strong></div><div className="ad-sample-card"><small>Công nợ</small><strong>28.350.000₫</strong></div></div>
        </div>
      </main>
    </div>
  );
}
