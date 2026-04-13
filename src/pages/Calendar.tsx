import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Milestone, Project, Task } from '../types';
export const Calendar: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      setLoading(true);
      Promise.all([
        api.tasks.getMyTasks(user.id),
        api.projects.list().then(async (projects) => {
          const milestoneGroups = await Promise.all(
            (projects as Project[]).map(async (project) => {
              try {
                return await api.projects.getMilestones(project.id);
              } catch {
                return [];
              }
            }),
          );
          return milestoneGroups.flat();
        }),
      ])
        .then(([taskList, milestoneList]) => {
          setTasks(taskList);
          setMilestones(milestoneList);
        })
        .catch(() => {
          setTasks([]);
          setMilestones([]);
        })
        .finally(() => setLoading(false));
    }
  }, [user]);

  const events = useMemo(() => {
    const taskEvents = tasks
      .filter((t) => t.dueDate || t.startDate || t.createdAt)
      .map((task) => {
        const start = task.startDate || task.dueDate || task.createdAt;
        const end = task.dueDate || task.startDate || task.createdAt;
        const startStr = start ? new Date(start).toISOString().slice(0, 10) : null;
        const endStr = end ? new Date(end).toISOString().slice(0, 10) : null;
        if (!startStr) return null;
        return {
          id: task.id,
          title: task.title,
          start: startStr,
          end: endStr && endStr !== startStr ? endStr : undefined,
          allDay: true,
          extendedProps: {
            taskId: task.id,
            projectId: task.projectId,
            status: task.status,
            kind: 'task',
          },
        };
      })
      .filter(Boolean) as { id: string; title: string; start: string; end?: string; allDay: boolean; extendedProps: any; color?: string }[];

    const milestoneEvents = milestones
      .filter((milestone) => milestone.dueDate)
      .map((milestone) => {
        const dueDate = new Date(milestone.dueDate).toISOString().slice(0, 10);
        return {
          id: `milestone-${milestone.id}`,
          title: `Milestone: ${milestone.title}`,
          start: dueDate,
          allDay: true,
          color: '#0ea5e9',
          extendedProps: {
            milestoneId: milestone.id,
            projectId: milestone.projectId,
            status: milestone.status,
            kind: 'milestone',
          },
        };
      });

    return [...taskEvents, ...milestoneEvents];
  }, [milestones, tasks]);

  const handleEventClick = (info: { event: { id: string; extendedProps: { projectId: string; kind?: string } } }) => {
    const projectId = info.event.extendedProps?.projectId;
    if (!projectId) return;
    const targetTab = info.event.extendedProps?.kind === 'milestone' ? 'milestones' : 'tasks';
    navigate(`/app/projects/${projectId}?tab=${targetTab}`);
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-display text-white flex items-center gap-2">
          <CalendarIcon className="w-8 h-8 text-cyan-500" />
          {t('calendar')}
        </h1>
        <p className="text-slate-400 mt-1">{t('calendar_subtitle')}</p>
      </div>

      <div className="calendar-wrap bg-slate-900/80 border border-slate-700 rounded-xl p-4 overflow-hidden [--fc-border-color:theme(colors.slate.700)] [--fc-button-bg-color:theme(colors.cyan.600)] [--fc-button-border-color:theme(colors.cyan.500)] [--fc-today-bg-color:theme(colors.cyan.500/10)] [--fc-page-bg-color:transparent] [--fc-neutral-bg-color:theme(colors.slate.800/50)] [--fc-list-event-hover-bg-color:theme(colors.slate.700)]">
        {loading ? (
          <p className="text-slate-500 py-12 text-center">{t('loading')}...</p>
        ) : (
          <FullCalendar
            plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,listWeek',
            }}
            events={events}
            eventClick={handleEventClick}
            height="auto"
            eventDisplay="block"
            dayMaxEvents={4}
            eventDidMount={(info) => {
              if (info.event.extendedProps?.kind === 'milestone') {
                info.el.style.borderRadius = '0.85rem';
                info.el.style.border = '1px solid rgba(14, 165, 233, 0.35)';
                info.el.style.background = 'linear-gradient(135deg, rgba(14, 165, 233, 0.20), rgba(37, 99, 235, 0.12))';
              }
            }}
            views={{
              listWeek: { buttonText: t('week') },
              dayGridMonth: { buttonText: t('month') },
            }}
            themeSystem="standard"
            eventClassNames="fc-event-cyan"
          />
        )}
      </div>
    </div>
  );
};

export default Calendar;
