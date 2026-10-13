import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CoursesPage from './pages/CoursesPage';
import NewAttendancePage from './pages/NewAttendancePage';
import ReviewPage from './pages/ReviewPage';
import HistoryPage from './pages/HistoryPage';
import StudentsPage from './pages/StudentsPage';
import StudentDetailPage from './pages/StudentDetailPage';
import ProfilePage from './pages/ProfilePage';
import StudentProfilePage from './pages/StudentProfilePage';
import StudentAttendancePage from './pages/StudentAttendancePage';
import ProfessorRequestsPage from './pages/ProfessorRequestsPage';
import AdminCoursesPage from './pages/AdminCoursesPage';
import NotFoundPage from './pages/NotFoundPage';
import { ROLES } from './utils/constants';

const staff = [ROLES.PROFESSOR, ROLES.ADMIN];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/attendance/history" element={<HistoryPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route element={<ProtectedRoute roles={[ROLES.STUDENT]} />}>
            <Route path="/student/profile" element={<StudentProfilePage />} />
            <Route path="/student/attendance" element={<StudentAttendancePage />} />
          </Route>
          <Route element={<ProtectedRoute roles={[ROLES.PROFESSOR]} />}>
            <Route path="/professor/requests" element={<ProfessorRequestsPage />} />
            <Route path="/attendance/new" element={<NewAttendancePage />} />
          </Route>
          <Route element={<ProtectedRoute roles={[ROLES.ADMIN]} />}>
            <Route path="/admin/courses" element={<AdminCoursesPage />} />
          </Route>
          <Route element={<ProtectedRoute roles={staff} />}>
            <Route path="/courses" element={<CoursesPage />} />
            <Route path="/students" element={<StudentsPage />} />
            <Route path="/students/:id" element={<StudentDetailPage />} />
            <Route path="/attendance/:sessionId/review" element={<ReviewPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
