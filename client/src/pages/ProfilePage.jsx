import { LogOut } from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import { useAuth } from '../context/AuthContext';

function Item({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2.5 text-sm last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold capitalize text-ink">{value}</dd>
    </div>
  );
}

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  return (
    <>
      <PageHeader title="Profile" />
      <Card scan="once" className="max-w-xl">
        <dl>
          <Item label="Name" value={user.name} />
          <Item label="Email" value={user.email} />
          <Item label="Role" value={user.role} />
          <Item label="Roll number" value={user.studentId} />
          <Item label="Department" value={user.department} />
        </dl>
        <Button className="mt-4" icon={LogOut} onClick={signOut}>
          Sign out
        </Button>
      </Card>
    </>
  );
}
