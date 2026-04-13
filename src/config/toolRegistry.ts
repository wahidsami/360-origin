import { LucideIcon, ClipboardList, Briefcase, FileText, AlertCircle, Plus, CheckSquare, Upload, MessageSquare, Users } from 'lucide-react';
import { Role } from '../types';

export interface ToolConfig {
  id: string;
  titleKey: string;
  icon: LucideIcon;
  path: string;
  roles: Role[];
  descriptionKey?: string;
}

export const TOOLS_REGISTRY: ToolConfig[] = [
  // DEV Tools
  { id: 'my_work', titleKey: 'my_work', icon: ClipboardList, path: '/app/my-work', roles: [Role.DEV, Role.PM, Role.OPS, Role.SUPER_ADMIN] },
  { id: 'post_update', titleKey: 'post_update', icon: MessageSquare, path: '/app/projects', roles: [Role.DEV, Role.PM] },
  
  // PM/OPS Tools
  { id: 'create_project', titleKey: 'create_project', icon: Plus, path: '/app/projects/new', roles: [Role.PM, Role.OPS, Role.SUPER_ADMIN] },
  { id: 'reports', titleKey: 'reports', icon: FileText, path: '/app/reports', roles: [Role.PM, Role.OPS, Role.SUPER_ADMIN, Role.CLIENT_MANAGER, Role.FINANCE] },
  { id: 'findings', titleKey: 'findings', icon: AlertCircle, path: '/app/findings', roles: [Role.PM, Role.OPS, Role.SUPER_ADMIN, Role.DEV] },
  { id: 'approvals', titleKey: 'approvals', icon: CheckSquare, path: '/app/dashboard#pending-approvals', roles: [Role.PM, Role.OPS, Role.SUPER_ADMIN] },
  { id: 'clients', titleKey: 'clients', icon: Users, path: '/app/clients', roles: [Role.FINANCE] },
  { id: 'projects', titleKey: 'projects', icon: Briefcase, path: '/app/projects', roles: [Role.FINANCE] },
  // CLIENT Tools
  { id: 'my_projects', titleKey: 'my_projects', icon: Briefcase, path: '/app/projects', roles: [Role.CLIENT_OWNER, Role.CLIENT_MANAGER, Role.CLIENT_MEMBER] },
  { id: 'shared_files', titleKey: 'shared_files', icon: Upload, path: '/app/dashboard#shared-files', roles: [Role.CLIENT_OWNER, Role.CLIENT_MANAGER, Role.CLIENT_MEMBER] },
];
