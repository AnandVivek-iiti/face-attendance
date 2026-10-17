import { Link } from 'react-router-dom';
import { BookOpen, Users } from 'lucide-react';
import Card from '../../components/ui/Card';
import ErrorState from '../../components/ui/ErrorState';
import PageHeader from '../../components/ui/PageHeader';
import Spinner from '../../components/ui/Spinner';
import StatCard from '../../components/ui/StatCard';
import { useAsync } from '../../hooks/useAsync';
import { getCourses } from '../../services/courseService';
import { getStudents } from '../../services/studentService';

export default function AdminDashboard({ user }) {
  const courses = useAsync(getCourses);
  const students = useAsync(getStudents);
  const header = <PageHeader title={user.name ? `Welcome, ${user.name}` : 'Dashboard'} />;

  if (courses.loading || students.loading) {
    return (
      <>
        {header}
        <Spinner label="Loading dashboard" variant="dashboard" />
      </>
    );
  }

  const error = courses.error || students.error;
  if (error) {
    return (
      <>
        {header}
        <ErrorState
          message={error}
          onRetry={() => {
            courses.reload();
            students.reload();
          }}
        />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="stagger grid gap-4 sm:grid-cols-2">
        <StatCard icon={BookOpen} label="Courses" value={courses.data.length} />
        <StatCard icon={Users} label="Students" value={students.data.length} />
      </div>
      <Card title="Manage" className="mt-6">
        <div className="flex gap-4 text-sm font-semibold text-primary">
          <Link to="/students" className="hover:underline">Students</Link>
          <Link to="/courses" className="hover:underline">Courses</Link>
        </div>
      </Card>
    </>
  );
}
