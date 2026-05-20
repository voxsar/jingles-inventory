/* global React */
// Icons — Lucide-inspired line icons, all stroke-based.
// Each icon accepts {size, className, style, strokeWidth}.

const Icon = ({ children, size = 18, strokeWidth = 1.75, className = "", style = {}, ...rest }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    {...rest}
  >
    {children}
  </svg>
);

const I = {};

I.Dashboard = (p) => <Icon {...p}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></Icon>;
I.Box = (p) => <Icon {...p}><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></Icon>;
I.Receipt = (p) => <Icon {...p}><path d="M4 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v18l-3-2-3 2-3-2-3 2-3-2-1 2Z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/></Icon>;
I.ReturnArrow = (p) => <Icon {...p}><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></Icon>;
I.Sku = (p) => <Icon {...p}><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></Icon>;
I.Money = (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 6v2"/><path d="M12 16v2"/></Icon>;
I.Tag = (p) => <Icon {...p}><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"/><circle cx="7" cy="7" r="1.5"/></Icon>;
I.Folder = (p) => <Icon {...p}><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z"/></Icon>;
I.Building = (p) => <Icon {...p}><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 14h.01"/><path d="M16 14h.01"/><path d="M12 14h.01"/></Icon>;
I.Cube3d = (p) => <Icon {...p}><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/><path d="M16.5 4.5 7.5 9.5"/></Icon>;
I.Transfer = (p) => <Icon {...p}><path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 20 4-4-4-4"/><path d="M21 16H7"/></Icon>;
I.Users = (p) => <Icon {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></Icon>;
I.User = (p) => <Icon {...p}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></Icon>;
I.Truck = (p) => <Icon {...p}><path d="M5 18H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h11v12"/><path d="M14 9h4l4 4v4a1 1 0 0 1-1 1h-2"/><circle cx="7.5" cy="18.5" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/></Icon>;
I.Sparkles = (p) => <Icon {...p}><path d="m12 3-1.9 5.8L4 10.6l5.8 2.1L12 19l1.9-6.3L20 10.6l-6.3-1.8Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></Icon>;
I.Spreadsheet = (p) => <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></Icon>;
I.Chart = (p) => <Icon {...p}><path d="M3 3v18h18"/><path d="m7 14 4-4 4 4 5-6"/></Icon>;
I.Settings = (p) => <Icon {...p}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/></Icon>;
I.LogOut = (p) => <Icon {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></Icon>;
I.Search = (p) => <Icon {...p}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></Icon>;
I.Plus = (p) => <Icon {...p}><path d="M12 5v14"/><path d="M5 12h14"/></Icon>;
I.X = (p) => <Icon {...p}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></Icon>;
I.Check = (p) => <Icon {...p}><path d="M20 6 9 17l-5-5"/></Icon>;
I.ChevronDown = (p) => <Icon {...p}><path d="m6 9 6 6 6-6"/></Icon>;
I.ChevronRight = (p) => <Icon {...p}><path d="m9 18 6-6-6-6"/></Icon>;
I.ChevronLeft = (p) => <Icon {...p}><path d="m15 18-6-6 6-6"/></Icon>;
I.ArrowUp = (p) => <Icon {...p}><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></Icon>;
I.ArrowDown = (p) => <Icon {...p}><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></Icon>;
I.ArrowRight = (p) => <Icon {...p}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></Icon>;
I.Bell = (p) => <Icon {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></Icon>;
I.Filter = (p) => <Icon {...p}><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z"/></Icon>;
I.Download = (p) => <Icon {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></Icon>;
I.Upload = (p) => <Icon {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/></Icon>;
I.Sun = (p) => <Icon {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></Icon>;
I.Moon = (p) => <Icon {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></Icon>;
I.Eye = (p) => <Icon {...p}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></Icon>;
I.Pencil = (p) => <Icon {...p}><path d="m12 20 9-9-4-4-9 9-1 5 5-1Z"/><path d="m14 6 4 4"/></Icon>;
I.Trash = (p) => <Icon {...p}><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/></Icon>;
I.MoreH = (p) => <Icon {...p}><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></Icon>;
I.MoreV = (p) => <Icon {...p}><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></Icon>;
I.Calendar = (p) => <Icon {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></Icon>;
I.Clock = (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></Icon>;
I.Warning = (p) => <Icon {...p}><path d="m10.3 3.86-8.17 14.13A2 2 0 0 0 3.85 21h16.3a2 2 0 0 0 1.71-3l-8.16-14.13a2 2 0 0 0-3.39 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></Icon>;
I.Info = (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></Icon>;
I.CheckCircle = (p) => <Icon {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></Icon>;
I.Barcode = (p) => <Icon {...p}><path d="M3 5v14"/><path d="M5 7v10"/><path d="M9 7v10"/><path d="M14 7v10"/><path d="M17 7v10"/><path d="M21 7v10"/></Icon>;
I.Pin = (p) => <Icon {...p}><path d="M20 10c0 7-8 12-8 12s-8-5-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></Icon>;
I.Variants = (p) => <Icon {...p}><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M6 9v6a3 3 0 0 0 3 3h6"/></Icon>;
I.Image = (p) => <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></Icon>;
I.Copy = (p) => <Icon {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></Icon>;
I.Help = (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></Icon>;
I.Command = (p) => <Icon {...p}><path d="M15 6V4a2 2 0 0 1 2-2 2 2 0 0 1 2 2 2 2 0 0 1-2 2h-2Zm0 0v12m0 0v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2 2 2 0 0 0-2-2h-2Zm0 0H9m0 0v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2 2 2 0 0 1 2-2h2Zm0 0V6m0 0V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2 2 2 0 0 0 2 2h2Z"/></Icon>;
I.Layers = (p) => <Icon {...p}><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></Icon>;
I.Send = (p) => <Icon {...p}><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></Icon>;
I.Target = (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></Icon>;
I.Ruler = (p) => <Icon {...p}><path d="m21.3 8.7-3.3-3.3a1 1 0 0 0-1.4 0L4 17.6a1 1 0 0 0 0 1.4l3.3 3.3a1 1 0 0 0 1.4 0L21.3 10.1a1 1 0 0 0 0-1.4Z"/><path d="m8 12 2 2"/><path d="m11 9 2 2"/><path d="m14 6 2 2"/><path d="m5 15 2 2"/></Icon>;
I.Status = (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 2"/></Icon>;
I.Puzzle = (p) => <Icon {...p}><path d="M19.4 13a2 2 0 1 1 0 4H17v2.4a2 2 0 1 1-4 0V17H8a2 2 0 0 1-2-2v-3H4a2 2 0 1 1 0-4h2V5a2 2 0 0 1 2-2h3V2.6a2 2 0 1 1 4 0V3h2a2 2 0 0 1 2 2v5h2Z"/></Icon>;
I.Brain = (p) => <Icon {...p}><path d="M12 5a3 3 0 1 0-5.99.14A3 3 0 0 0 4 10a3 3 0 0 0 1 5.85V18a3 3 0 0 0 6 0v-1"/><path d="M12 5a3 3 0 1 1 5.99.14A3 3 0 0 1 20 10a3 3 0 0 1-1 5.85V18a3 3 0 0 1-6 0v-1"/><path d="M9 13a3 3 0 0 0 3 0"/></Icon>;
I.Database = (p) => <Icon {...p}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/></Icon>;
I.Wand = (p) => <Icon {...p}><path d="m15 4 6 6-11 11H4v-6Z"/><path d="M14 7l3 3"/><path d="M5 6 4 4l2-1"/><path d="m20 5-1-2-2 1"/></Icon>;
I.Bolt = (p) => <Icon {...p}><path d="M13 2 3 14h7l-1 8 10-12h-7Z"/></Icon>;
I.Globe = (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20"/><path d="M12 2a15 15 0 0 0 0 20"/></Icon>;
I.Stack = (p) => <Icon {...p}><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 12 10 5 10-5"/><path d="m2 17 10 5 10-5"/></Icon>;
I.Coins = (p) => <Icon {...p}><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></Icon>;
I.Floor = (p) => <Icon {...p}><path d="M4 22V8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v14"/><path d="M9 22v-4h6v4"/><path d="M9 12h6"/></Icon>;
I.Shelf = (p) => <Icon {...p}><rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/><path d="M6 10v4"/><path d="M18 10v4"/></Icon>;
I.Rack = (p) => <Icon {...p}><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M4 9h16"/><path d="M4 15h16"/></Icon>;
I.Refresh = (p) => <Icon {...p}><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></Icon>;
I.Magic = (p) => <Icon {...p}><path d="m4 4 16 16"/><path d="M9 4h.01"/><path d="M15 8h.01"/><path d="M14 14h.01"/><path d="M4 9h.01"/><path d="M9 15h.01"/><path d="M19 11h.01"/></Icon>;
I.File = (p) => <Icon {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></Icon>;
I.History = (p) => <Icon {...p}><path d="M3 12a9 9 0 1 0 9-9 9.7 9.7 0 0 0-6.7 2.8L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></Icon>;
I.Print = (p) => <Icon {...p}><path d="M6 9V2h12v7"/><rect x="3" y="9" width="18" height="9" rx="2"/><path d="M6 14h12v8H6Z"/></Icon>;
I.Zap = (p) => <Icon {...p}><path d="M13 2 3 14h7l-1 8 10-12h-7Z"/></Icon>;
I.Mail = (p) => <Icon {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 6 10 7 10-7"/></Icon>;
I.Phone = (p) => <Icon {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2Z"/></Icon>;
I.Hash = (p) => <Icon {...p}><path d="M4 9h16"/><path d="M4 15h16"/><path d="m10 3-4 18"/><path d="m18 3-4 18"/></Icon>;
I.Type = (p) => <Icon {...p}><path d="M4 7V5h16v2"/><path d="M9 19h6"/><path d="M12 5v14"/></Icon>;
I.AtSign = (p) => <Icon {...p}><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></Icon>;
I.LinkExt = (p) => <Icon {...p}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="m10 14 11-11"/></Icon>;
I.Eraser = (p) => <Icon {...p}><path d="m20 20-8-8"/><path d="m20 4-9 9-7-7 9-9Z"/></Icon>;
I.Award = (p) => <Icon {...p}><circle cx="12" cy="8" r="6"/><path d="m9 14-2 7 5-3 5 3-2-7"/></Icon>;
I.Globe2 = (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2c2.5 3 4 6.5 4 10s-1.5 7-4 10c-2.5-3-4-6.5-4-10s1.5-7 4-10Z"/></Icon>;
I.Briefcase = (p) => <Icon {...p}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></Icon>;
I.Drag = (p) => <Icon {...p}><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></Icon>;
I.Star = (p) => <Icon {...p}><path d="m12 2 3 7 7 .7-5.3 4.9 1.6 7.1L12 18l-6.3 3.7 1.6-7.1L2 9.7 9 9Z"/></Icon>;
I.Sliders = (p) => <Icon {...p}><path d="M21 4H14"/><path d="M10 4H3"/><path d="M21 12h-9"/><path d="M8 12H3"/><path d="M21 20h-7"/><path d="M10 20H3"/><circle cx="12" cy="4" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="12" cy="20" r="2"/></Icon>;
I.Cloud = (p) => <Icon {...p}><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10Z"/></Icon>;

window.I = I;
