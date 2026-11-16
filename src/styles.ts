export const CLS = {
  card: "rounded-[14px] border border-border bg-card p-4",
  cardElevated: "rounded-[14px] border border-border bg-card p-4 shadow-sm",
  cardMuted: "rounded-[12px] border border-border bg-muted/40 p-3",
  heroCard: "rounded-[18px] border border-border bg-card p-4 shadow-sm",

  btnBase: "flex-row items-center justify-center gap-1.5 transition-colors disabled:opacity-50 focus-visible:border-ring",
  btnSm: "h-8 px-2.5 rounded-[8px]",
  btnMd: "h-9 px-3.5 rounded-[10px]",
  btnLg: "h-11 px-5 rounded-[12px]",
  btnPrimary: "bg-primary border border-primary hover:bg-primary/90 active:bg-primary/80",
  btnSecondary: "bg-secondary border border-border hover:bg-secondary/80 active:bg-secondary/70",
  btnOutline: "bg-transparent border border-border hover:bg-muted active:bg-muted/80",
  btnGhost: "bg-transparent border border-transparent hover:bg-muted active:bg-muted/80",
  btnDanger: "bg-destructive border border-destructive hover:bg-destructive/90 active:bg-destructive/80",
  btnSuccess: "bg-success border border-success hover:bg-success/90 active:bg-success/80",

  btnTextPrimary: "text-primary-foreground",
  btnTextSecondary: "text-secondary-foreground",
  btnTextFg: "text-foreground",
  btnTextDanger: "text-destructive-foreground",
  btnTextSuccess: "text-success-foreground",

  input: "h-9 w-full rounded-[10px] border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring",
  inputMono: "h-9 w-full rounded-[10px] border border-input bg-background px-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-ring",
  textareaMono: "min-h-20 w-full rounded-[10px] border border-input bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-ring",

  switchRoot: "flex-row items-center",
  switchTrack: "h-5 w-9 rounded-full bg-input p-0.5 transition-colors checked:bg-primary disabled:opacity-50",
  switchThumb: "size-4 rounded-full bg-background shadow-sm transition-transform checked:translate-x-4",

  tabsRoot: "flex-row self-start gap-1 rounded-[12px] border border-border bg-muted p-1",
  tabsIndicator: "inset-y-1 rounded-[8px] bg-card shadow-xs",
  tabItem: "group rounded-[8px] px-3 py-1.5",
  tabText: "text-xs font-medium text-muted-foreground group-selected:font-semibold group-selected:text-foreground",

  selectTrigger: "h-9 w-full flex-row items-center justify-between rounded-[10px] border border-input bg-background px-3",
  selectPopup: "rounded-[12px] border border-border bg-popover p-1 shadow-lg",
  selectList: "max-h-56",
  selectItem: "group flex-row items-center rounded-[8px] px-2.5 py-2 focus:bg-accent selected:bg-accent",
  selectItemText: "text-xs text-popover-foreground group-selected:font-semibold group-selected:text-accent-foreground",

  dialogBackdrop: "bg-foreground/30 items-center justify-center p-4",
  dialogCard: "max-h-[90%] w-full overflow-hidden rounded-[16px] border border-border bg-card shadow-xl",
  sheetCard: "h-[92%] max-h-[92%] w-full overflow-hidden rounded-t-[18px] border-t border-border bg-card shadow-xl",

  togglePill: "group h-8 rounded-[8px] border border-border bg-transparent px-2.5 flex-row items-center justify-center hover:bg-muted aria-pressed:border-primary aria-pressed:bg-accent",
  togglePillText: "text-xs font-medium text-foreground group-aria-pressed:font-semibold group-aria-pressed:text-accent-foreground",

  badgeNeutral: "self-start rounded-full border border-border bg-muted px-2.5 py-0.5",
  badgePrimary: "self-start rounded-full border border-primary/30 bg-primary/15 px-2.5 py-0.5",
  badgeSuccess: "self-start rounded-full border border-success/30 bg-success/15 px-2.5 py-0.5",
  badgeWarning: "self-start rounded-full border border-warning/30 bg-warning/15 px-2.5 py-0.5",
  badgeDanger: "self-start rounded-full border border-destructive/30 bg-destructive/15 px-2.5 py-0.5",
  badgeInfo: "self-start rounded-full border border-info/30 bg-info/15 px-2.5 py-0.5",

  separatorH: "h-px w-full bg-border",
} as const;
