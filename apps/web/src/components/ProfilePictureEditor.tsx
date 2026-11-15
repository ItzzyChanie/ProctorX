import { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { Button } from './ui/Button';
import { api, assetSrc } from '../lib/api';
import { useAuthStore } from '../store/authStore';

export function ProfilePictureEditor() {
  const { user, updateUser } = useAuthStore();
  const [picture, setPicture] = useState(user?.profilePicture ?? '');
  const savedPicture = user?.profilePicture ?? '';
  useEffect(() => setPicture(savedPicture), [savedPicture]);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');

  const choose = (file?: File) => {
    if (
      !file ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size > 2_000_000
    )
      return setMessage('Choose a PNG, JPEG, or WebP image under 2 MB.');
    const reader = new FileReader();
    reader.onload = () => setPicture(String(reader.result));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/auth/profile-picture', {
        profilePicture: picture,
      });
      updateUser(data);
      setMessage('Profile picture updated successfully.');
    } catch {
      setMessage('Could not update profile picture.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-5 flex flex-col items-center gap-3 rounded-xl border border-border p-5">
      <div className="grid h-28 w-28 place-items-center overflow-hidden rounded-full bg-brand-soft text-brand">
        {picture ? (
          <img alt="Profile picture preview" src={assetSrc(picture)} className="h-full w-full object-cover" />
        ) : (
          <Camera size={32} />
        )}
      </div>
      <label
        className={`cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200 ${
          savedPicture
            ? 'bg-brand text-white shadow-rest hover:-translate-y-px hover:bg-brand/90 hover:shadow-glow'
            : 'border border-border text-text-2 hover:bg-brand-soft hover:text-brand'
        }`}
      >
        {savedPicture ? 'Update Picture' : 'Choose Picture'}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => choose(e.target.files?.[0])}
          className="hidden"
        />
      </label>
      <div className="flex gap-2">
        {picture !== savedPicture && (
          <Button disabled={busy} onClick={() => void save()}>
            Save Picture
          </Button>
        )}
        {picture && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setPicture('');
              if (savedPicture)
                void (async () => {
                  setBusy(true);
                  try {
                    const { data } = await api.post('/auth/profile-picture', {
                      profilePicture: '',
                    });
                    updateUser(data);
                    setMessage('Profile picture removed.');
                  } catch {
                    setPicture(savedPicture);
                    setMessage('Could not remove profile picture.');
                  } finally {
                    setBusy(false);
                  }
                })();
            }}
          >
            Remove
          </Button>
        )}
      </div>
      {message && <p className="text-xs text-text-2">{message}</p>}
    </div>
  );
}
