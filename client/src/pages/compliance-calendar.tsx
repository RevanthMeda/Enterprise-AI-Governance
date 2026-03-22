import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Clock,
  ShieldCheck,
  FileText,
  RefreshCw,
  Landmark,
  Filter,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { resolveApiUrl } from "@/lib/api-url";
import { captureCsrfTokenFromResponse } from "@/lib/queryClient";
import { usePageCopy } from "@/lib/page-copy";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: "control_deadline" | "overdue_control" | "approval_deadline" | "evidence_uploaded" | "reassessment_due" | "regulatory_milestone";
  priority: "high" | "medium" | "low";
  status: "upcoming" | "overdue" | "completed";
  entityId: string | null;
  entityType: string | null;
  description: string;
}

const eventTypeConfig: Record<string, { label: string; color: string; dotColor: string; icon: typeof Clock; bgColor: string }> = {
  overdue_control: { label: "Overdue Control", color: "text-red-600 dark:text-red-400", dotColor: "bg-red-500", icon: AlertTriangle, bgColor: "bg-red-50 dark:bg-red-950/20" },
  control_deadline: { label: "Control Deadline", color: "text-orange-600 dark:text-orange-400", dotColor: "bg-orange-500", icon: Clock, bgColor: "bg-orange-50 dark:bg-orange-950/20" },
  approval_deadline: { label: "Approval Deadline", color: "text-amber-600 dark:text-amber-400", dotColor: "bg-amber-500", icon: FileText, bgColor: "bg-amber-50 dark:bg-amber-950/20" },
  evidence_uploaded: { label: "Evidence Uploaded", color: "text-green-600 dark:text-green-400", dotColor: "bg-green-500", icon: ShieldCheck, bgColor: "bg-green-50 dark:bg-green-950/20" },
  reassessment_due: { label: "Reassessment Due", color: "text-purple-600 dark:text-purple-400", dotColor: "bg-purple-500", icon: RefreshCw, bgColor: "bg-purple-50 dark:bg-purple-950/20" },
  regulatory_milestone: { label: "Regulatory Milestone", color: "text-blue-600 dark:text-blue-400", dotColor: "bg-blue-500", icon: Landmark, bgColor: "bg-blue-50 dark:bg-blue-950/20" },
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const days: { date: Date; isCurrentMonth: boolean }[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    days.push({ date: new Date(year, month - 1, daysInPrevMonth - i), isCurrentMonth: false });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }

  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    days.push({ date: new Date(year, month + 1, d), isCurrentMonth: false });
  }

  return days;
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isToday(date: Date): boolean {
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function ComplianceCalendar() {
  const pageCopy = usePageCopy();
  const [, navigate] = useLocation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  const monthParam = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

  const { data: events = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar-events", monthParam, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ month: monthParam });
      if (typeFilter !== "all") params.set("type", typeFilter);
      const res = await fetch(resolveApiUrl(`/api/calendar-events?${params.toString()}`), { credentials: "include" });
      captureCsrfTokenFromResponse(res);
      if (!res.ok) throw new Error("Failed to load calendar events");
      return res.json();
    },
  });

  const days = useMemo(() => getMonthDays(currentYear, currentMonth), [currentYear, currentMonth]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = formatDateKey(new Date(event.date));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
    }
    return map;
  }, [events]);

  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [];
    return eventsByDate.get(formatDateKey(selectedDate)) || [];
  }, [selectedDate, eventsByDate]);

  const summaryStats = useMemo(() => {
    const now = new Date();
    const oneWeekLater = new Date(now);
    oneWeekLater.setDate(oneWeekLater.getDate() + 7);

    return {
      upcomingThisWeek: events.filter((e) => {
        const d = new Date(e.date);
        return d >= now && d <= oneWeekLater && e.status !== "completed";
      }).length,
      overdueItems: events.filter((e) => e.status === "overdue" || e.type === "overdue_control").length,
      nextMilestone: events
        .filter((e) => e.type === "regulatory_milestone" && new Date(e.date) >= now)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] || null,
      totalEvents: events.length,
    };
  }, [events]);

  const goToPrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6" data-testid="page-compliance-calendar">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-7 w-48" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-compliance-calendar">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <CalendarDays className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight" data-testid="heading-compliance-calendar">{pageCopy.complianceCalendar.title}</h1>
            <p className="text-xs text-muted-foreground">{pageCopy.complianceCalendar.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px] h-8 text-xs" data-testid="select-event-type-filter">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue placeholder="Filter events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              <SelectItem value="control_deadline">Control Deadlines</SelectItem>
              <SelectItem value="overdue_control">Overdue Controls</SelectItem>
              <SelectItem value="approval_deadline">Approval Deadlines</SelectItem>
              <SelectItem value="evidence_uploaded">Evidence Uploads</SelectItem>
              <SelectItem value="reassessment_due">Reassessments</SelectItem>
              <SelectItem value="regulatory_milestone">Regulatory Milestones</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card data-testid="stat-upcoming-this-week">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-orange-100 dark:bg-orange-950/30">
              <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summaryStats.upcomingThisWeek}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Due This Week</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-overdue-items" className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => navigate("/approvals")}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-red-100 dark:bg-red-950/30">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{summaryStats.overdueItems}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Overdue Items</p>
            </div>
            <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card data-testid="stat-next-milestone">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-950/30">
              <Landmark className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs font-semibold truncate max-w-[200px]">
                {summaryStats.nextMilestone ? summaryStats.nextMilestone.title.replace("EU AI Act: ", "") : "No upcoming milestones"}
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight">
                {summaryStats.nextMilestone ? new Date(summaryStats.nextMilestone.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2" data-testid="card-calendar">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                {MONTHS[currentMonth]} {currentYear}
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={goToToday} data-testid="button-today">
                  Today
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={goToPrevMonth} data-testid="button-prev-month">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={goToNextMonth} data-testid="button-next-month">
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-0">
              {WEEKDAYS.map((day) => (
                <div key={day} className="py-2 text-center text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {day}
                </div>
              ))}
              {days.map((day, i) => {
                const dateKey = formatDateKey(day.date);
                const dayEvents = eventsByDate.get(dateKey) || [];
                const hasOverdue = dayEvents.some((e) => e.status === "overdue" || e.type === "overdue_control");
                const hasUpcoming = dayEvents.some((e) => e.status === "upcoming" && e.type !== "regulatory_milestone");
                const hasMilestone = dayEvents.some((e) => e.type === "regulatory_milestone");
                const hasCompleted = dayEvents.some((e) => e.status === "completed");
                const isSelected = selectedDate && isSameDay(day.date, selectedDate);
                const isTodayDate = isToday(day.date);

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(day.date)}
                    data-testid={`calendar-day-${dateKey}`}
                    className={`
                      relative h-14 sm:h-16 border border-border/40 p-1 text-left transition-colors
                      hover:bg-accent/50 focus:outline-none focus:ring-1 focus:ring-primary/50
                      ${!day.isCurrentMonth ? "text-muted-foreground/40 bg-muted/20" : ""}
                      ${isSelected ? "bg-accent ring-1 ring-primary/50" : ""}
                      ${isTodayDate && !isSelected ? "bg-primary/5" : ""}
                    `}
                  >
                    <span className={`text-xs font-medium ${isTodayDate ? "text-primary font-bold" : ""}`}>
                      {day.date.getDate()}
                    </span>
                    {dayEvents.length > 0 && (
                      <div className="absolute bottom-1 left-1 right-1 flex items-center gap-0.5 flex-wrap">
                        {hasOverdue && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                        {hasUpcoming && <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />}
                        {hasMilestone && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
                        {hasCompleted && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
                        {dayEvents.length > 1 && (
                          <span className="text-[8px] text-muted-foreground ml-auto">{dayEvents.length}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-4 mt-4 pt-3 border-t">
              <span className="text-[10px] text-muted-foreground font-medium">Legend:</span>
              {Object.entries(eventTypeConfig).map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-full ${cfg.dotColor}`} />
                  <span className="text-[10px] text-muted-foreground">{cfg.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-day-events">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              {selectedDate
                ? selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
                : "Select a date"}
            </CardTitle>
            {selectedDateEvents.length > 0 && (
              <p className="text-[10px] text-muted-foreground">{selectedDateEvents.length} event{selectedDateEvents.length !== 1 ? "s" : ""}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
            {selectedDateEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <CalendarDays className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-xs">No events on this date</p>
              </div>
            ) : (
              selectedDateEvents.map((event) => {
                const cfg = eventTypeConfig[event.type] || eventTypeConfig.control_deadline;
                const Icon = cfg.icon;
                return (
                  <div
                    key={event.id}
                    className={`rounded-md p-3 ${cfg.bgColor} cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all`}
                    data-testid={`event-${event.id}`}
                    onClick={() => {
                      if (event.entityId && event.entityType === "system") {
                        navigate(`/systems/${event.entityId}`);
                      }
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${cfg.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-medium truncate">{event.title}</span>
                          <Badge
                            variant={event.status === "overdue" ? "destructive" : event.status === "completed" ? "default" : "secondary"}
                            className="text-[9px] h-4 px-1"
                          >
                            {event.status}
                          </Badge>
                          {event.priority === "high" && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1 border-red-300 text-red-600 dark:text-red-400">
                              High Priority
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{event.description}</p>
                        {event.entityId && event.entityType === "system" && (
                          <div className="flex items-center gap-0.5 mt-1 text-[10px] text-primary">
                            <span>View system</span>
                            <ArrowRight className="h-2.5 w-2.5" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
