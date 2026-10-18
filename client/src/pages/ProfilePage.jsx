import { useState } from 'react';
import { LogOut, MailWarning } from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import { TextInput } from '../components/ui/Field';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { changePassword, updateProfile } from '../services/authService';
import { getErrorMessage } from '../utils/errors';

function Item({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2.5 text-sm last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold capitalize text-ink">{value}</dd>
    </div>
  );
}

// Professor / admin self-service: edit name + department, and change password.
function EditableAccount() {
  const { user, applySession } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState({ name: user.name || '', department: user.department || '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busyProfile, setBusyProfile] = useState(false);
  const [busyPassword, setBusyPassword] = useState(false);

  const verified = user.role !== 'professor' || user.emailVerified;

  const saveProfile = async (event) => {
    event.preventDefault();
    setBusyProfile(true);
    try {
      const next = await updateProfile({ name: profile.name.trim(), department: profile.department.trim() });
      applySession({ user: next });
      toast.success('Profile updated.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyProfile(false);
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    if (passwords.newPassword !== passwords.confirm) {
      toast.error('New password and confirmation do not match.');
      return;
    }
    setBusyPassword(true);
    try {
      const result = await changePassword({
        currentPassword: passwords.currentPassword || undefined,
        newPassword: passwords.newPassword,
      });
      // Older tokens stop working after a change; keep this session alive.
      applySession(result);
      setPasswords({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Password changed.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyPassword(false);
    }
  };

  return (
    <>
      <Card title="Your details" className="max-w-xl">
        <dl className="mb-4">
          <Item label="Email" value={user.email} />
          <Item label="Role" value={user.role === 'professor' ? 'Professor' : 'Administrator'} />
        </dl>

        {!verified ? (
          <div className="flex items-start gap-3 rounded-lg border border-line bg-white/[0.03] p-3 text-sm">
            <MailWarning size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
            <p className="text-muted">
              Verify your email address before editing your profile or password. Sign out and choose{' '}
              <span className="text-ink">“email me a sign-in link”</span> on the login page, then open the link we send
              you.
            </p>
          </div>
        ) : (
          <form onSubmit={saveProfile} className="space-y-3">
            <TextInput
              label="Name"
              value={profile.name}
              onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
            />
            <TextInput
              label="Department"
              value={profile.department}
              onChange={(e) => setProfile((p) => ({ ...p, department: e.target.value }))}
              placeholder="ME"
            />
            <div className="flex justify-end pt-1">
              <Button type="submit" variant="primary" loading={busyProfile}>
                Save changes
              </Button>
            </div>
          </form>
        )}
      </Card>

      {verified && (
        <Card title="Change password" className="mt-5 max-w-xl">
          <form onSubmit={savePassword} className="space-y-3">
            <TextInput
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={passwords.currentPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, currentPassword: e.target.value }))}
            />
            <TextInput
              label="New password"
              type="password"
              autoComplete="new-password"
              hint="At least 8 characters."
              value={passwords.newPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
            />
            <TextInput
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              value={passwords.confirm}
              onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))}
            />
            <div className="flex justify-end pt-1">
              <Button
                type="submit"
                variant="primary"
                loading={busyPassword}
                disabled={!passwords.newPassword || passwords.newPassword.length < 8}
              >
                Change password
              </Button>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const staff = user.role === 'professor' || user.role === 'admin';

  return (
    <>
      <PageHeader title="Profile" />
      {staff ? (
        <EditableAccount />
      ) : (
        <Card scan="once" className="max-w-xl">
          <dl>
            <Item label="Name" value={user.name} />
            <Item label="Email" value={user.email} />
            <Item label="Role" value={user.role} />
            <Item label="Roll number" value={user.profile?.rollNumber} />
            <Item label="Department" value={user.department} />
          </dl>
        </Card>
      )}
      <Button className="mt-4" icon={LogOut} onClick={signOut}>
        Sign out
      </Button>
    </>
  );
}
