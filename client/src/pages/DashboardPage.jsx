import { useAuth } from '../context/AuthContext';
import { ROLES } from '../utils/constants';
import AdminDashboard from './dashboard/AdminDashboard';
import ProfessorDashboard from './dashboard/ProfessorDashboard';
import StudentDashboard from './dashboard/StudentDashboard';

export default function DashboardPage() {
  const { user } = useAuth();
  if (user.role === ROLES.STUDENT) return <StudentDashboard user={user} />;
  if (user.role === ROLES.ADMIN) return <AdminDashboard user={user} />;
  return <ProfessorDashboard user={user} />;
}
