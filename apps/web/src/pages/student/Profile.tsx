import { Monitor } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardHeader } from '../../components/ui/Card';
import { ProfilePictureEditor } from '../../components/ProfilePictureEditor';
import { useAuthStore } from '../../store/authStore';
import { ProfileFieldsEditor } from '../../components/ProfileFieldsEditor';

export default function Profile() {
  const { user } = useAuthStore();
  return (
    <DashboardLayout
      role="student"
      pageTitle="Profile & Device"
      userName={user?.fullName ?? 'Student'}
      userTag="BSCS-4A · Student"
    >
      <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Card>
          <CardHeader title="Profile" />
          <ProfilePictureEditor />
          <ProfileFieldsEditor role="student" />
        </Card>
        <Card>
          <CardHeader title="Device & security" />
          <div className="flex items-center gap-3 p-3.5 rounded-[10px] bg-brand-soft mb-3.5">
            <Monitor size={20} className="text-brand" />
            <div>
              <div className="font-body text-[13px] font-semibold text-text-1">
                ProctorX Client v1.4.2
              </div>
              <div className="font-body text-[11.5px] text-text-2">
                Installed and running
              </div>
            </div>
          </div>
          <div className="font-body text-xs text-text-2 leading-relaxed">
            All monitoring data is protected with AES-256 encryption at rest and
            TLS in transit, and is only accessible to your professor and college
            administrators under role-based access control.
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
