/**
 * Papers - 论文库（分页 + 文件夹/日期分类导航）
 * @author Color2333
 */
import { useEffect, useState, useCallback, useMemo, useRef, memo } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Badge, Empty, Spinner, Modal, Input } from "@/components/ui";
import { PaperListSkeleton } from "@/components/Skeleton";
import { useToast } from "@/contexts/ToastContext";
import { paperApi, ingestApi, topicApi, pipelineApi, actionApi, tasksApi, notesApi, interestApi, jobApi } from "@/services/api";
import { useGlobalTasks } from "@/contexts/GlobalTaskContext";
import { formatDate, truncate } from "@/lib/utils";
import type { Paper, Topic, FolderStats, CollectionAction, Note, TopicNotesResponse, InterestAnalysis } from "@/types";
import {
  FileText,
  Download,
  Search,
  RefreshCw,
  ExternalLink,
  BookOpen,
  Eye,
  EyeOff,
  BookMarked,
  ChevronRight,
  ChevronLeft,
  Cpu,
  Zap,
  CheckCircle2,
  Heart,
  LayoutGrid,
  LayoutList,
  Folder,
  FolderOpen,
  Clock,
  Inbox,
  Library,
  Tag,
  Calendar,
  ChevronsLeft,
  ChevronsRight,
  Bot,
  CalendarClock,
  ArrowUp,
  ArrowDown,
  StickyNote,
  X,
  Pencil,
  Trash2,
  BookmarkPlus,
  Compass,
  Plus,
  CheckCircle,
  Loader2,
} from "lucide-react";

/* ========== 类型 ========== */
interface FolderItem {
  id: string;
  type: "special" | "topic" | "date";
  name: string;
  icon: React.ReactNode;
  count: number;
  color: string;
  /** 日期筛选用 */
  dateStr?: string;
}

const statusBadge: Record<string, { label: string; variant: "default" | "warning" | "success" }> = {
  unread: { label: "未读", variant: "default" },
  skimmed: { label: "已粗读", variant: "warning" },
  deep_read: { label: "已精读", variant: "success" },
};

/**
 * 格式化日期为中文标签
 */
function formatDateLabel(dateStr: string): string {
  const today = new Date();
  const d = new Date(dateStr + "T00:00:00");
  const diffMs = today.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "昨天";
  if (diffDays === 2) return "前天";
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m}月${day}日`;
}

export default function Papers() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { tasks } = useGlobalTasks();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [ingestOpen, setIngestOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState("");
  const [batchPct, setBatchPct] = useState(0);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  /* 分页 */
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  /* 文件夹相关 */
  const [folderStats, setFolderStats] = useState<FolderStats | null>(null);
  const [activeFolder, setActiveFolder] = useState("all");
  const [activeDate, setActiveDate] = useState<string | undefined>();
  const [statsLoading, setStatsLoading] = useState(true);
  const [dateSectionOpen, setDateSectionOpen] = useState(false);

  /* 行动记录 */
  const [actionsList, setActionsList] = useState<CollectionAction[]>([]);
  const [actionSectionOpen, setActionSectionOpen] = useState(false);
  const [activeActionId, setActiveActionId] = useState<string | undefined>();

  /* 搜索防抖 */
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  /* 排序 + 状态筛选 */
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState("");
  const [hideViewed, setHideViewed] = useState(false);

  /* 主题笔记面板 */
  const [topicNotesOpen, setTopicNotesOpen] = useState(false);
  const [topicNotesId, setTopicNotesId] = useState<string | null>(null);
  const [topicNotesName, setTopicNotesName] = useState("");
  const [topicNotesData, setTopicNotesData] = useState<TopicNotesResponse | null>(null);
  const [topicNoteInput, setTopicNoteInput] = useState("");
  const [topicNotesLoading, setTopicNotesLoading] = useState(false);

  const openTopicNotes = useCallback((id: string, name: string) => {
    setTopicNotesId(id);
    setTopicNotesName(name);
    setTopicNotesOpen(true);
    setTopicNotesLoading(true);
    notesApi.listByTopic(id).then(setTopicNotesData).catch(() => {}).finally(() => setTopicNotesLoading(false));
  }, []);

  const refreshTopicNotes = useCallback(() => {
    if (!topicNotesId) return;
    notesApi.listByTopic(topicNotesId).then(setTopicNotesData).catch(() => {});
  }, [topicNotesId]);

  const handleAddTopicNote = async () => {
    if (!topicNotesId || !topicNoteInput.trim()) return;
    try {
      await notesApi.createTopicNote(topicNotesId, topicNoteInput.trim());
      setTopicNoteInput("");
      refreshTopicNotes();
    } catch { toast("error", "保存笔记失败"); }
  };

  const handleDeleteTopicNote = async (noteId: string) => {
    try {
      await notesApi.delete(noteId);
      refreshTopicNotes();
    } catch { toast("error", "删除笔记失败"); }
  };

  /* 兴趣发现面板 */
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [discoveryData, setDiscoveryData] = useState<InterestAnalysis | null>(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryAnalyzing, setDiscoveryAnalyzing] = useState(false);
  const [discoverySubscribed, setDiscoverySubscribed] = useState<Set<string>>(new Set());

  const openDiscovery = useCallback(() => {
    setDiscoveryOpen(true);
    setDiscoveryLoading(true);
    interestApi.suggestions().then(setDiscoveryData).catch(() => {}).finally(() => setDiscoveryLoading(false));
  }, []);

  const handleDiscoveryAnalyze = async () => {
    setDiscoveryAnalyzing(true);
    try {
      await interestApi.analyze();
      await new Promise((r) => setTimeout(r, 3000));
      const result = await interestApi.suggestions();
      setDiscoveryData(result);
    } catch { toast("error", "分析失败"); }
    finally { setDiscoveryAnalyzing(false); }
  };

  const handleDiscoverySubscribe = async (name: string, query: string) => {
    try {
      await interestApi.subscribe(name, query);
      setDiscoverySubscribed((prev) => new Set(prev).add(name));
      loadFolderStats();
    } catch { toast("error", "订阅失败"); }
  };

  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(searchTimerRef.current);
  }, [searchTerm]);

  /* 加载文件夹统计 + 行动记录 */
  const loadFolderStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [stats, actionsRes] = await Promise.all([
        paperApi.folderStats(),
        actionApi.list({ limit: 30 }).catch(() => ({ items: [] as CollectionAction[], total: 0 })),
      ]);
      setFolderStats(stats);
      setActionsList(actionsRes.items);
    } catch { toast("error", "加载文件夹统计失败"); } finally { setStatsLoading(false); }
  }, [toast]);

  /* 加载论文列表 */
  const loadPapers = useCallback(async () => {
    setLoading(true);
    try {
      // 按行动筛选走独立接口
      if (activeActionId) {
        const res = await actionApi.papers(activeActionId, 200);
        setPapers(res.items.map((p) => ({ ...p, abstract: "", metadata: {} } as unknown as Paper)));
        setTotal(res.items.length);
        setTotalPages(1);
        setSelected(new Set());
        setLoading(false);
        return;
      }

      let folder: string | undefined;
      let topicId: string | undefined;

      if (activeFolder === "all") {
        // 默认
      } else if (activeFolder === "favorites" || activeFolder === "recent" || activeFolder === "unclassified") {
        folder = activeFolder;
      } else if (!activeFolder.startsWith("date:")) {
        topicId = activeFolder;
      }

      const res = await paperApi.latest({
        page,
        pageSize,
        topicId,
        folder,
        date: activeDate,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        sortBy,
        sortOrder,
      });
      setPapers(res.items);
      setTotal(res.total);
      setTotalPages(res.total_pages);
      setSelected(new Set());
    } catch { toast("error", "加载论文列表失败"); } finally { setLoading(false); }
  }, [activeFolder, activeDate, activeActionId, page, pageSize, debouncedSearch, statusFilter, sortBy, sortOrder, toast]);

  const triggerIngest = useCallback(async () => {
    try {
      await jobApi.dailyRun();
      toast("info", "正在执行完整流程（抓取+粗读+精读+简报），完成后自动刷新...");
    } catch {
      toast("error", "触发抓取失败");
    }
  }, [toast]);

  /* 当全局任务完成时自动刷新论文列表 */
  const prevTasksRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    let shouldRefresh = false;
    for (const t of tasks) {
      if (prevTasksRef.current[t.task_id] === false && t.finished && t.success) {
        shouldRefresh = true;
      }
      prevTasksRef.current[t.task_id] = t.finished;
    }
    if (shouldRefresh) {
      loadFolderStats();
      loadPapers();
    }
  }, [tasks, loadFolderStats, loadPapers]);

  useEffect(() => { loadFolderStats(); }, [loadFolderStats]);
  useEffect(() => { loadPapers(); }, [loadPapers]);

  /* 无论文时自动触发抓取（仅一次） */
  const hasTriggeredEmptyIngest = useRef(false);
  useEffect(() => {
    if (
      !loading &&
      total === 0 &&
      !searchTerm &&
      activeFolder === "all" &&
      !activeActionId &&
      !hasTriggeredEmptyIngest.current
    ) {
      hasTriggeredEmptyIngest.current = true;
      triggerIngest();
    }
  }, [loading, total, searchTerm, activeFolder, activeActionId, triggerIngest]);

  /* 构建文件夹列表 */
  const folders = useMemo((): FolderItem[] => {
    if (!folderStats) return [];
    const items: FolderItem[] = [
      { id: "all", type: "special", name: "全部论文", icon: <Library className="h-4 w-4" />, count: folderStats.total, color: "text-ink" },
      { id: "favorites", type: "special", name: "收藏", icon: <Heart className="h-4 w-4" />, count: folderStats.favorites, color: "text-red-500" },
      { id: "recent", type: "special", name: "最近 7 天", icon: <Clock className="h-4 w-4" />, count: folderStats.recent_7d, color: "text-info" },
    ];
    for (const t of folderStats.by_topic) {
      items.push({
        id: t.topic_id,
        type: "topic",
        name: t.topic_name,
        icon: <Folder className="h-4 w-4" />,
        count: t.count,
        color: "text-primary",
      });
    }
    if (folderStats.unclassified > 0) {
      items.push({ id: "unclassified", type: "special", name: "未分类", icon: <Inbox className="h-4 w-4" />, count: folderStats.unclassified, color: "text-ink-tertiary" });
    }
    return items;
  }, [folderStats]);

  /* 日期条目 */
  const dateEntries = useMemo(() => {
    if (!folderStats?.by_date) return [];
    return folderStats.by_date.map((d) => ({
      dateStr: d.date,
      label: formatDateLabel(d.date),
      count: d.count,
    }));
  }, [folderStats]);

  /* 搜索由后端处理，前端直接使用 papers */
  const filtered = hideViewed ? papers.filter((p) => !p.user_viewed) : papers;

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);
  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => prev.size === filtered.length ? new Set() : new Set(filtered.map((p) => p.id)));
  }, [filtered]);

  const handleToggleFavorite = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    /* 乐观更新 */
    setPapers((prev) => prev.map((p) => (p.id === id ? { ...p, favorited: !p.favorited } : p)));
    try {
      const res = await paperApi.toggleFavorite(id);
      setPapers((prev) => prev.map((p) => (p.id === res.id ? { ...p, favorited: res.favorited } : p)));
      loadFolderStats();
    } catch {
      toast("error", "收藏操作失败");
      setPapers((prev) => prev.map((p) => (p.id === id ? { ...p, favorited: !p.favorited } : p)));
    }
  }, [loadFolderStats, toast]);

  const handleBatchSkim = async () => {
    const ids = [...selected].filter((id) => { const p = papers.find((pp) => pp.id === id); return p && p.read_status === "unread"; });
    if (!ids.length) { setBatchProgress("没有可粗读的未读论文"); setBatchPct(0); return; }
    setBatchRunning(true); setBatchPct(0);
    const tid = `batch_skim_${Date.now()}`;
    tasksApi.track({ action: "start", task_id: tid, task_type: "batch_skim", title: `批量粗读 ${ids.length} 篇`, total: ids.length }).catch(() => {});
    let done = 0, failed = 0;
    for (const id of ids) {
      done++;
      setBatchProgress(`粗读中 ${done}/${ids.length}`);
      setBatchPct(Math.round((done / ids.length) * 100));
      tasksApi.track({ action: "update", task_id: tid, current: done, message: `粗读中 ${done}/${ids.length}` }).catch(() => {});
      try { await pipelineApi.skim(id); } catch { failed++; }
    }
    tasksApi.track({ action: "finish", task_id: tid, success: failed === 0, error: failed > 0 ? `${failed} 篇失败` : undefined }).catch(() => {});
    setBatchProgress(failed > 0 ? `完成 ${done - failed} 篇，${failed} 篇失败` : `完成 ${done} 篇`);
    setBatchPct(100);
    if (failed > 0) toast("warning", `${failed} 篇粗读失败`);
    else toast("success", `粗读完成 ${done} 篇`);
    setBatchRunning(false); await loadPapers();
  };

  const handleBatchEmbed = async () => {
    const ids = [...selected].filter((id) => { const p = papers.find((pp) => pp.id === id); return p && !p.has_embedding; });
    if (!ids.length) { setBatchProgress("已全部嵌入"); setBatchPct(0); return; }
    setBatchRunning(true); setBatchPct(0);
    const tid = `batch_embed_${Date.now()}`;
    tasksApi.track({ action: "start", task_id: tid, task_type: "batch_embed", title: `批量嵌入 ${ids.length} 篇`, total: ids.length }).catch(() => {});
    let done = 0, failed = 0;
    for (const id of ids) {
      done++;
      setBatchProgress(`嵌入中 ${done}/${ids.length}`);
      setBatchPct(Math.round((done / ids.length) * 100));
      tasksApi.track({ action: "update", task_id: tid, current: done, message: `嵌入中 ${done}/${ids.length}` }).catch(() => {});
      try { await pipelineApi.embed(id); } catch { failed++; }
    }
    tasksApi.track({ action: "finish", task_id: tid, success: failed === 0, error: failed > 0 ? `${failed} 篇失败` : undefined }).catch(() => {});
    setBatchProgress(failed > 0 ? `完成 ${done - failed} 篇，${failed} 篇失败` : `完成 ${done} 篇`);
    setBatchPct(100);
    if (failed > 0) toast("warning", `${failed} 篇嵌入失败`);
    else toast("success", `嵌入完成 ${done} 篇`);
    setBatchRunning(false); await loadPapers();
  };

  const handleFolderClick = useCallback((folderId: string) => {
    setActiveFolder(folderId);
    setActiveDate(undefined);
    setActiveActionId(undefined);
    setSearchTerm("");
    setPage(1);
  }, []);

  const handleDateClick = useCallback((dateStr: string) => {
    setActiveFolder("date:" + dateStr);
    setActiveDate(dateStr);
    setActiveActionId(undefined);
    setSearchTerm("");
    setPage(1);
  }, []);

  const activeFolderName = useMemo(() => {
    if (activeDate) return formatDateLabel(activeDate) + " 收录";
    return folders.find((f) => f.id === activeFolder)?.name || "全部论文";
  }, [activeFolder, activeDate, folders]);

  const refresh = useCallback(async () => {
    await triggerIngest();
  }, [triggerIngest]);

  /* 分页导航 */
  const goPage = useCallback((p: number) => {
    setPage(Math.max(1, Math.min(p, totalPages)));
  }, [totalPages]);

  return (
    <div className="animate-fade-in flex h-full gap-0">
      {/* ========== 左侧文件夹面板 ========== */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-page/50 lg:flex">
        {/* 标题 */}
        <div className="flex items-center justify-between p-4 pb-2">
          <h2 className="text-sm font-semibold text-ink">文件夹</h2>
          <button aria-label="刷新" onClick={refresh} className="rounded-lg p-1 text-ink-tertiary transition-colors hover:bg-hover hover:text-ink" title="刷新">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* 文件夹列表 */}
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {statsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner text="" />
            </div>
          ) : (
            <div className="space-y-0.5">
              {folders.map((folder, idx) => {
                const isActive = activeFolder === folder.id && !activeDate;
                const showDivider = (
                  (idx > 0 && folder.type !== folders[idx - 1].type) ||
                  (folder.id === "unclassified" && folders[idx - 1]?.type === "topic")
                );
                return (
                  <div key={folder.id}>
                    {showDivider && <div className="my-2 border-t border-border-light" />}
                    {idx === 3 && folders.some((f) => f.type === "topic") && (
                      <p className="mb-1 mt-3 px-2 text-[10px] font-medium uppercase tracking-widest text-ink-tertiary">
                        订阅主题
                      </p>
                    )}
                    <div className="flex items-center">
                      <button
                        onClick={() => handleFolderClick(folder.id)}
                        className={`group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-all ${
                          isActive
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-ink-secondary hover:bg-hover hover:text-ink"
                        }`}
                      >
                        <span className={isActive ? "text-primary" : folder.color}>
                          {isActive && folder.type === "topic"
                            ? <FolderOpen className="h-4 w-4" />
                            : folder.icon}
                        </span>
                        <span className="flex-1 truncate">{folder.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          isActive
                            ? "bg-primary/15 text-primary"
                            : "bg-page text-ink-tertiary"
                        }`}>
                          {folder.count}
                        </span>
                      </button>
                      {folder.type === "topic" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openTopicNotes(folder.id, folder.name); }}
                          className="shrink-0 rounded-lg p-1.5 text-ink-tertiary transition-colors hover:bg-primary/10 hover:text-primary"
                          title="主题笔记"
                        >
                          <StickyNote className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {folder.id === "favorites" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openDiscovery(); }}
                          className="shrink-0 rounded-lg p-1.5 text-ink-tertiary transition-colors hover:bg-primary/10 hover:text-primary"
                          title="兴趣发现"
                        >
                          <Compass className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* ========== 按日期收录 ========== */}
              {dateEntries.length > 0 && (
                <>
                  <div className="my-2 border-t border-border-light" />
                  <button
                    onClick={() => setDateSectionOpen(!dateSectionOpen)}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
                  >
                    <Calendar className="h-3.5 w-3.5 text-ink-tertiary" />
                    <span className="flex-1 text-[10px] font-medium uppercase tracking-widest text-ink-tertiary">
                      按收录日期
                    </span>
                    <ChevronRight className={`h-3 w-3 text-ink-tertiary transition-transform ${dateSectionOpen ? "rotate-90" : ""}`} />
                  </button>
                  {dateSectionOpen && (
                    <div className="space-y-0.5 pl-1">
                      {dateEntries.map((entry) => {
                        const isActive = activeDate === entry.dateStr;
                        return (
                          <button
                            key={entry.dateStr}
                            onClick={() => handleDateClick(entry.dateStr)}
                            className={`group flex w-full items-center gap-2.5 rounded-xl px-3 py-1.5 text-left text-[13px] transition-all ${
                              isActive
                                ? "bg-primary/10 font-medium text-primary"
                                : "text-ink-secondary hover:bg-hover hover:text-ink"
                            }`}
                          >
                            <span className={`text-[11px] ${isActive ? "text-primary" : "text-ink-tertiary"}`}>
                              {entry.dateStr.slice(5)}
                            </span>
                            <span className="flex-1 truncate">{entry.label}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              isActive ? "bg-primary/15 text-primary" : "bg-page text-ink-tertiary"
                            }`}>
                              {entry.count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* ========== 行动记录 ========== */}
              {actionsList.length > 0 && (
                <>
                  <div className="my-2 border-t border-border-light" />
                  <button
                    onClick={() => setActionSectionOpen(!actionSectionOpen)}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
                  >
                    <Download className="h-3.5 w-3.5 text-ink-tertiary" />
                    <span className="flex-1 text-[10px] font-medium uppercase tracking-widest text-ink-tertiary">
                      收集记录
                    </span>
                    <ChevronRight className={`h-3 w-3 text-ink-tertiary transition-transform ${actionSectionOpen ? "rotate-90" : ""}`} />
                  </button>
                  {actionSectionOpen && (
                    <div className="space-y-0.5 pl-1">
                      {actionsList.map((action) => {
                        const isActive = activeActionId === action.id;
                        return (
                          <button
                            key={action.id}
                            onClick={() => {
                              setActiveActionId(isActive ? undefined : action.id);
                              if (!isActive) { setActiveFolder("all"); setActiveDate(undefined); }
                              setPage(1);
                            }}
                            className={`group flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-[13px] transition-all ${
                              isActive
                                ? "bg-primary/10 font-medium text-primary"
                                : "text-ink-secondary hover:bg-hover hover:text-ink"
                            }`}
                          >
                            <ActionBadge type={action.action_type} />
                            <span className="min-w-0 flex-1 truncate">{action.title}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              isActive ? "bg-primary/15 text-primary" : "bg-page text-ink-tertiary"
                            }`}>
                              {action.paper_count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </nav>

        {/* 底部按钮 */}
        <div className="border-t border-border p-3">
          <Button
            size="sm"
            icon={<Download className="h-3.5 w-3.5" />}
            onClick={() => setIngestOpen(true)}
            className="w-full"
          >
            ArXiv 摄入
          </Button>
        </div>
      </aside>

      {/* ========== 右侧论文列表 ========== */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-ink">{activeFolderName}</h1>
            <span className="rounded-full bg-page px-2.5 py-0.5 text-xs font-medium text-ink-secondary">
              {total} 篇
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* 视图切换 */}
            <div className="flex rounded-lg border border-border bg-surface p-0.5">
              <button
                aria-label="列表视图"
                onClick={() => setViewMode("list")}
                className={`rounded-md p-1.5 transition-colors ${viewMode === "list" ? "bg-primary/10 text-primary" : "text-ink-tertiary hover:text-ink"}`}
              >
                <LayoutList className="h-3.5 w-3.5" />
              </button>
              <button
                aria-label="网格视图"
                onClick={() => setViewMode("grid")}
                className={`rounded-md p-1.5 transition-colors ${viewMode === "grid" ? "bg-primary/10 text-primary" : "text-ink-tertiary hover:text-ink"}`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
            <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={refresh}>刷新</Button>
            <Button size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => setIngestOpen(true)} className="lg:hidden">摄入</Button>
          </div>
        </div>

        {/* 搜索 + 排序筛选 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border-light px-5 py-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
            <input
              type="text"
              placeholder="搜索标题、关键词、arxiv ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-xs text-ink placeholder:text-ink-placeholder focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* 排序筛选控件 */}
          {selected.size === 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              {/* 状态筛选 */}
              <div className="flex items-center rounded-lg border border-border bg-surface p-0.5">
                {([
                  { value: "", label: "全部" },
                  { value: "unread", label: "未读" },
                  { value: "skimmed", label: "已粗读" },
                  { value: "deep_read", label: "已精读" },
                ] as { value: string; label: string }[]).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setStatusFilter(opt.value); setPage(1); }}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${ statusFilter === opt.value ? "bg-primary/10 text-primary" : "text-ink-tertiary hover:text-ink" }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* 隐藏已读 */}
              <button
                onClick={() => setHideViewed((v) => !v)}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  hideViewed ? "bg-primary/10 text-primary" : "text-ink-tertiary hover:text-ink"
                }`}
                title={hideViewed ? "显示全部论文" : "隐藏已浏览论文"}
              >
                {hideViewed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {hideViewed ? "已隐藏已读" : "隐藏已读"}
              </button>

              {/* 分隔线 */}
              <div className="h-4 w-px bg-border-light" />

              {/* 排序字段 */}
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
                className="h-7 cursor-pointer rounded-lg border border-border bg-surface px-2 text-[11px] text-ink-secondary focus:border-primary focus:outline-none"
              >
                <option value="created_at">入库时间</option>
                <option value="publication_date">发表时间</option>
                <option value="title">标题</option>
              </select>

              {/* 排序方向 */}
              <button
                onClick={() => { setSortOrder((o) => (o === "desc" ? "asc" : "desc")); setPage(1); }}
                className="flex h-7 items-center rounded-lg border border-border bg-surface px-2 text-ink-tertiary transition-colors hover:bg-hover hover:text-ink"
                title={sortOrder === "desc" ? "当前：倒序，点击切换升序" : "当前：升序，点击切换倒序"}
              >
                {sortOrder === "desc"
                  ? <ArrowDown className="h-3.5 w-3.5" />
                  : <ArrowUp className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}

          {/* 批量操作 */}
          {selected.size > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5">
              <span className="text-xs font-medium text-primary">已选 {selected.size}</span>
              <Button size="sm" variant="secondary" onClick={handleBatchSkim} disabled={batchRunning} icon={<Zap className="h-3 w-3" />}>粗读</Button>
              <Button size="sm" variant="secondary" onClick={handleBatchEmbed} disabled={batchRunning} icon={<Cpu className="h-3 w-3" />}>嵌入</Button>
              <button onClick={() => setSelected(new Set())} className="text-[10px] text-ink-tertiary hover:text-ink">取消</button>
              {batchProgress && (
                <div className="flex items-center gap-2">
                  {batchRunning && (
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-border">
                      <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${batchPct}%` }} />
                    </div>
                  )}
                  <span className="text-[10px] text-ink-secondary">{batchProgress}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 论文列表 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4">
              <PaperListSkeleton />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Empty
                icon={<FileText className="h-14 w-14" />}
                title={searchTerm ? "没有匹配的论文" : "该文件夹暂无论文"}
                description={searchTerm ? "尝试不同的关键词" : "从 ArXiv 摄入论文开始你的研究之旅"}
                action={
                  !searchTerm ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={triggerIngest}>自动抓取</Button>
                      <Button size="sm" variant="secondary" onClick={() => setIngestOpen(true)}>手动搜索</Button>
                    </div>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="p-4">
              {/* 全选 */}
              <div className="mb-2 flex items-center gap-2 px-1">
                <input
                  type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleSelectAll}
                  className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary/30"
                />
                <span className="text-[11px] text-ink-tertiary">
                  全选 / 第 {page} 页，共 {total} 篇
                </span>
              </div>

              {viewMode === "list" ? (
                <div className="space-y-1.5">
                  {filtered.map((paper) => (
                    <PaperListItem
                      key={paper.id}
                      paper={paper}
                      selected={selected.has(paper.id)}
                      onSelect={() => toggleSelect(paper.id)}
                      onFavorite={(e) => handleToggleFavorite(e, paper.id)}
                      onClick={() => navigate(`/papers/${paper.id}`)}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((paper) => (
                    <PaperGridItem
                      key={paper.id}
                      paper={paper}
                      onFavorite={(e) => handleToggleFavorite(e, paper.id)}
                      onClick={() => navigate(`/papers/${paper.id}`)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========== 分页 ========== */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <span className="text-xs text-ink-tertiary">
              共 {total} 篇，第 {page}/{totalPages} 页
            </span>
            <div className="flex items-center gap-1">
              <button
                aria-label="首页"
                onClick={() => goPage(1)}
                disabled={page <= 1}
                className="rounded-lg p-1.5 text-ink-secondary transition-colors hover:bg-hover disabled:opacity-30"
                title="首页"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                aria-label="上一页"
                onClick={() => goPage(page - 1)}
                disabled={page <= 1}
                className="rounded-lg p-1.5 text-ink-secondary transition-colors hover:bg-hover disabled:opacity-30"
                title="上一页"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {/* 页码按钮 */}
              {(() => {
                const items: (number | "dots")[] = [];
                const start = Math.max(1, page - 2);
                const end = Math.min(totalPages, page + 2);

                if (start > 1) items.push(1);
                if (start > 2) items.push("dots");
                for (let i = start; i <= end; i++) items.push(i);
                if (end < totalPages - 1) items.push("dots");
                if (end < totalPages) items.push(totalPages);

                return items.map((item, idx) => {
                  if (item === "dots") {
                    return <span key={`dots-${idx}`} className="px-1 text-xs text-ink-tertiary">...</span>;
                  }
                  return (
                    <button
                      key={item}
                      onClick={() => goPage(item)}
                      className={`min-w-[2rem] rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                        item === page
                          ? "bg-primary text-white"
                          : "text-ink-secondary hover:bg-hover"
                      }`}
                    >
                      {item}
                    </button>
                  );
                });
              })()}

              <button
                aria-label="下一页"
                onClick={() => goPage(page + 1)}
                disabled={page >= totalPages}
                className="rounded-lg p-1.5 text-ink-secondary transition-colors hover:bg-hover disabled:opacity-30"
                title="下一页"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                aria-label="末页"
                onClick={() => goPage(totalPages)}
                disabled={page >= totalPages}
                className="rounded-lg p-1.5 text-ink-secondary transition-colors hover:bg-hover disabled:opacity-30"
                title="末页"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </main>

      <IngestModal open={ingestOpen} onClose={() => setIngestOpen(false)} onDone={() => { loadPapers(); loadFolderStats(); }} />

      {/* ========== 主题笔记滑出面板 ========== */}
      {topicNotesOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setTopicNotesOpen(false)} />
          <div className="relative flex h-full w-full max-w-md flex-col bg-surface shadow-2xl animate-in slide-in-from-right">
            {/* 头部 */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
                  <StickyNote className="h-4 w-4 text-primary" />
                  {topicNotesName}
                </h2>
                <p className="mt-0.5 text-xs text-ink-tertiary">主题笔记 & 论文笔记汇总</p>
              </div>
              <button onClick={() => setTopicNotesOpen(false)} className="rounded-lg p-2 text-ink-tertiary transition-colors hover:bg-hover hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 添加主题笔记 */}
            <div className="border-b border-border/60 px-5 py-3">
              <div className="flex gap-2">
                <textarea
                  value={topicNoteInput}
                  onChange={(e) => setTopicNoteInput(e.target.value)}
                  placeholder="写下关于该研究方向的想法..."
                  rows={2}
                  className="flex-1 resize-none rounded-xl border border-border bg-page px-3 py-2 text-sm text-ink placeholder:text-ink-tertiary focus:border-primary focus:outline-none"
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddTopicNote(); }}
                />
                <button
                  onClick={handleAddTopicNote}
                  disabled={!topicNoteInput.trim()}
                  className="shrink-0 self-end rounded-xl bg-primary px-3 py-2 text-sm text-white transition-colors hover:bg-primary/90 disabled:opacity-40"
                >
                  <BookmarkPlus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* 笔记内容 */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {topicNotesLoading ? (
                <div className="flex justify-center py-12"><Spinner text="加载中..." /></div>
              ) : !topicNotesData ? (
                <Empty label="加载失败" />
              ) : (
                <div className="space-y-6">
                  {/* 主题级笔记 */}
                  {topicNotesData.topic_notes.length > 0 && (
                    <div>
                      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                        <StickyNote className="h-3 w-3" /> 主题笔记
                      </h3>
                      <div className="space-y-2">
                        {topicNotesData.topic_notes.map((note) => (
                          <TopicNoteCard key={note.id} note={note} onDelete={handleDeleteTopicNote} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 按论文分组的笔记 */}
                  {topicNotesData.paper_groups.map((group) => (
                    <div key={group.paper_id}>
                      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink">
                        <FileText className="h-3 w-3 text-primary" />
                        <span className="truncate">{group.paper_title || group.paper_id}</span>
                        <span className="shrink-0 text-[10px] font-normal text-ink-tertiary">({group.notes.length})</span>
                      </h3>
                      <div className="space-y-2 pl-4">
                        {group.notes.map((note) => (
                          <TopicNoteCard key={note.id} note={note} onDelete={handleDeleteTopicNote} />
                        ))}
                      </div>
                    </div>
                  ))}

                  {topicNotesData.topic_notes.length === 0 && topicNotesData.paper_groups.length === 0 && (
                    <Empty label="还没有笔记" />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========== 兴趣发现面板 ========== */}
      {discoveryOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDiscoveryOpen(false)} />
          <div className="relative flex h-full w-full max-w-md flex-col bg-surface shadow-2xl animate-in slide-in-from-right">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Compass className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold text-ink">兴趣发现</h2>
              </div>
              <button onClick={() => setDiscoveryOpen(false)} className="rounded-lg p-1.5 text-ink-tertiary hover:bg-hover">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {discoveryLoading ? (
                <div className="flex justify-center py-12"><Spinner text="加载中..." /></div>
              ) : discoveryData && discoveryData.suggestions.length > 0 ? (
                <div className="space-y-4">
                  {discoveryData.analyzed_at && (
                    <p className="text-[11px] text-ink-tertiary">
                      基于 {discoveryData.favorite_count} 篇收藏分析 · {new Date(discoveryData.analyzed_at).toLocaleDateString("zh-CN")}
                    </p>
                  )}
                  {discoveryData.interests.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {discoveryData.interests.map((interest) => (
                        <span key={interest} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                          {interest}
                        </span>
                      ))}
                    </div>
                  )}
                  {discoveryData.suggestions.map((s) => {
                    const subscribed = discoverySubscribed.has(s.name);
                    return (
                      <div key={s.name} className="rounded-xl border border-border bg-page p-4">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-ink">{s.name}</p>
                            <p className="mt-1 text-xs leading-relaxed text-ink-secondary">{s.reason}</p>
                          </div>
                          <button
                            onClick={() => handleDiscoverySubscribe(s.name, s.query)}
                            disabled={subscribed}
                            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                              subscribed
                                ? "bg-success-light text-success"
                                : "bg-primary/10 text-primary hover:bg-primary/20"
                            }`}
                          >
                            {subscribed ? <><CheckCircle className="mr-1 inline h-3.5 w-3.5" />已订阅</> : <><Plus className="mr-1 inline h-3.5 w-3.5" />订阅</>}
                          </button>
                        </div>
                        <div className="mb-2 flex items-center gap-2">
                          <span className="rounded-md bg-surface px-2 py-0.5 font-mono text-[10px] text-ink-tertiary">{s.query}</span>
                          <span className="text-[10px] text-ink-tertiary">置信度 {(s.confidence * 100).toFixed(0)}%</span>
                        </div>
                        {s.preview_papers.length > 0 && (
                          <div className="space-y-1 border-t border-border-light pt-2">
                            <p className="text-[10px] font-medium uppercase tracking-wider text-ink-tertiary">预览论文</p>
                            {s.preview_papers.map((p) => (
                              <p key={p.arxiv_id} className="truncate text-[11px] text-ink-secondary">
                                <Search className="mr-1 inline h-3 w-3 text-ink-tertiary" />{p.title}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button
                    onClick={handleDiscoveryAnalyze}
                    disabled={discoveryAnalyzing}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-hover"
                  >
                    {discoveryAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    重新分析
                  </button>
                </div>
              ) : (
                <div className="space-y-4 py-12 text-center">
                  <Heart className="mx-auto h-10 w-10 text-ink-tertiary/30" />
                  <div>
                    <p className="text-sm text-ink-tertiary">收藏论文后可以发现新方向</p>
                    <p className="mt-1 text-xs text-ink-tertiary">系统会分析你的收藏偏好，推荐新的主题订阅</p>
                  </div>
                  <button
                    onClick={handleDiscoveryAnalyze}
                    disabled={discoveryAnalyzing}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary/10 px-5 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
                  >
                    {discoveryAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    分析我的收藏
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========== 论文卡片：列表模式 ========== */
const PaperListItem = memo(function PaperListItem({ paper, selected, onSelect, onFavorite, onClick }: {
  paper: Paper;
  selected: boolean;
  onSelect: () => void;
  onFavorite: (e: React.MouseEvent) => void;
  onClick: () => void;
}) {
  const sc = statusBadge[paper.read_status] || statusBadge.unread;
  return (
    <div className={`group rounded-xl border bg-surface transition-all hover:shadow-sm ${
      selected ? "border-primary/30 ring-1 ring-primary/10" : "border-border/60"
    }`}>
      <div className="flex items-start gap-3 px-3.5 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          onClick={(e) => e.stopPropagation()}
          className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-border text-primary focus:ring-primary/30"
        />
        <button className="flex min-w-0 flex-1 items-start gap-2.5 text-left" onClick={onClick}>
          {/* 状态图标 */}
          <div className={`mt-0.5 shrink-0 rounded-lg p-1.5 ${
            paper.read_status === "deep_read" ? "bg-success-light" :
            paper.read_status === "skimmed" ? "bg-warning-light" : "bg-page"
          }`}>
            {paper.read_status === "deep_read" ? <BookMarked className="h-3.5 w-3.5 text-success" /> :
             paper.read_status === "skimmed" ? <Eye className="h-3.5 w-3.5 text-warning" /> :
             <BookOpen className="h-3.5 w-3.5 text-ink-tertiary" />}
          </div>
          {/* 内容 */}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start gap-2">
              <h3 className="text-[13px] font-semibold leading-snug text-ink transition-colors group-hover:text-primary">
                {paper.title}
              </h3>
              <Badge variant={sc.variant} className="shrink-0">{sc.label}</Badge>
              {paper.user_viewed && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-page px-1.5 py-0.5 text-[9px] font-medium text-ink-tertiary">
                  <Eye className="h-2.5 w-2.5" /> 已读
                </span>
              )}
              {paper.has_embedding && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-info-light px-1.5 py-0.5 text-[9px] font-medium text-info">
                  <CheckCircle2 className="h-2.5 w-2.5" /> 嵌入
                </span>
              )}
            </div>
            {paper.title_zh && <p className="text-[11px] text-ink-tertiary">{paper.title_zh}</p>}
            {paper.abstract && (
              <p className="text-[11px] leading-relaxed text-ink-secondary">{truncate(paper.abstract, 140)}</p>
            )}
            {/* 标签行 */}
            <div className="flex flex-wrap items-center gap-1">
              {paper.topics?.map((t) => (
                <span key={t} className="inline-flex items-center gap-0.5 rounded-md bg-primary/8 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                  <Tag className="h-2 w-2" />{t}
                </span>
              ))}
              {paper.keywords?.slice(0, 3).map((kw) => (
                <span key={kw} className="rounded-md bg-page px-1.5 py-0.5 text-[9px] text-ink-tertiary">{kw}</span>
              ))}
            </div>
            {/* 元信息 */}
            <div className="flex items-center gap-3 text-[10px] text-ink-tertiary">
              {paper.arxiv_id && (
                <span className="flex items-center gap-0.5">
                  <ExternalLink className="h-2.5 w-2.5" />{paper.arxiv_id}
                </span>
              )}
              {paper.publication_date && <span>{formatDate(paper.publication_date)}</span>}
            </div>
          </div>
          <ChevronRight className="mt-2 h-3.5 w-3.5 shrink-0 text-ink-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
        <button aria-label={paper.favorited ? "取消收藏" : "收藏"} onClick={onFavorite} className="mt-0.5 shrink-0 rounded-lg p-1 transition-colors hover:bg-error/10">
          <Heart className={`h-3.5 w-3.5 ${paper.favorited ? "fill-red-500 text-red-500" : "text-ink-tertiary"}`} />
        </button>
      </div>
    </div>
  );
});

/* ========== 论文卡片：网格模式 ========== */
const PaperGridItem = memo(function PaperGridItem({ paper, onFavorite, onClick }: {
  paper: Paper;
  onFavorite: (e: React.MouseEvent) => void;
  onClick: () => void;
}) {
  const sc = statusBadge[paper.read_status] || statusBadge.unread;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className="group flex cursor-pointer flex-col rounded-xl border border-border/60 bg-surface p-3.5 text-left transition-all hover:shadow-sm"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Badge variant={sc.variant}>{sc.label}</Badge>
          {paper.user_viewed && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-page px-1.5 py-0.5 text-[9px] font-medium text-ink-tertiary">
              <Eye className="h-2.5 w-2.5" /> 已读
            </span>
          )}
        </div>
        <button aria-label={paper.favorited ? "取消收藏" : "收藏"} onClick={onFavorite} className="rounded-lg p-1 transition-colors hover:bg-error/10">
          <Heart className={`h-3.5 w-3.5 ${paper.favorited ? "fill-red-500 text-red-500" : "text-ink-tertiary"}`} />
        </button>
      </div>
      <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-ink transition-colors group-hover:text-primary">
        {paper.title}
      </h3>
      {paper.title_zh && <p className="mt-0.5 line-clamp-1 text-[11px] text-ink-tertiary">{paper.title_zh}</p>}
      {paper.abstract && <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-ink-secondary">{truncate(paper.abstract, 100)}</p>}
      <div className="mt-auto pt-2.5">
        <div className="flex flex-wrap gap-1">
          {paper.topics?.slice(0, 2).map((t) => (
            <span key={t} className="inline-flex items-center gap-0.5 rounded-md bg-primary/8 px-1.5 py-0.5 text-[9px] font-medium text-primary">
              <Tag className="h-2 w-2" />{t}
            </span>
          ))}
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-ink-tertiary">
          <span>{paper.arxiv_id}</span>
          <span>{paper.publication_date && formatDate(paper.publication_date)}</span>
        </div>
      </div>
    </div>
  );
});

/* ========== 摄入弹窗 ========== */
function IngestModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [query, setQuery] = useState("");
  const [maxResults, setMaxResults] = useState(20);
  const [topicId, setTopicId] = useState("");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<number | null>(null);

  const { toast } = useToast();
  useEffect(() => {
    if (open) { topicApi.list().then((r) => setTopics(r.items)).catch(() => { toast("error", "加载主题列表失败"); }); setResult(null); }
  }, [open, toast]);

  const handleIngest = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await ingestApi.arxiv(query, maxResults, topicId || undefined);
      setResult(res.ingested);
      onDone();
    } finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="ArXiv 论文摄入">
      <div className="space-y-4">
        <Input label="搜索查询" placeholder="例如: transformer attention mechanism" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="最大数量" type="number" value={maxResults} onChange={(e) => setMaxResults(parseInt(e.target.value) || 20)} />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-ink">关联主题</label>
            <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none">
              <option value="">不关联</option>
              {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        {result !== null && (
          <div className="rounded-xl bg-success-light p-3 text-sm font-medium text-success">
            <CheckCircle2 className="mr-2 inline h-4 w-4" />成功摄入 {result} 篇论文
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>关闭</Button>
          <Button onClick={handleIngest} loading={loading}>开始摄入</Button>
        </div>
      </div>
    </Modal>
  );
}

function ActionBadge({ type }: { type: string }) {
  const cls = "h-3 w-3 shrink-0";
  switch (type) {
    case "agent_collect": return <Bot className={`${cls} text-info`} />;
    case "auto_collect": return <CalendarClock className={`${cls} text-success`} />;
    case "manual_collect": return <Download className={`${cls} text-primary`} />;
    case "subscription_ingest": return <Tag className={`${cls} text-warning`} />;
    default: return <FileText className={`${cls} text-ink-tertiary`} />;
  }
}

function TopicNoteCard({ note, onDelete }: { note: Note; onDelete: (id: string) => void }) {
  return (
    <div className="group rounded-xl border border-border/60 bg-page p-3 transition-colors hover:border-border">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5">
            <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
              note.note_type === "highlight" ? "bg-amber-500/10 text-amber-600" :
              note.note_type === "topic_note" ? "bg-blue-500/10 text-blue-600" :
              "bg-primary/10 text-primary"
            }`}>
              {note.note_type === "highlight" ? "高亮" : note.note_type === "topic_note" ? "主题" : "想法"}
            </span>
            {note.page_number != null && <span className="text-[9px] text-ink-tertiary">P{note.page_number}</span>}
            <span className="text-[9px] text-ink-tertiary">
              {new Date(note.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          {note.source_text && (
            <div className="mb-1.5 rounded-lg border-l-2 border-amber-400 bg-amber-500/5 px-2 py-1 text-[11px] leading-relaxed text-ink-secondary">
              {note.source_text.length > 200 ? note.source_text.slice(0, 200) + "..." : note.source_text}
            </div>
          )}
          {note.content && <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink">{note.content}</p>}
        </div>
        <button
          onClick={() => onDelete(note.id)}
          className="shrink-0 rounded-lg p-1 text-ink-tertiary opacity-0 transition-all group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
