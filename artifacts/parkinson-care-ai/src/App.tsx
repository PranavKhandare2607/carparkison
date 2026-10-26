import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation } from 'wouter';
import {
  Activity, ArrowRight, Bell, BookOpen, CalendarDays, Check, ChevronRight, Clock3, Download,
  HeartPulse, Hospital, LifeBuoy, LocateFixed, MapPin, Menu, MessageCircle, Navigation, Pencil,
  Pill, Plus, Search, Send, Settings2, ShieldCheck, ShoppingBag, Siren, Stethoscope, Sun,
  Trash2, UserRound, Users, Volume2, X, WifiOff
} from 'lucide-react';
import {
  getGetAdherenceReportQueryKey, getGetAiRiskQueryKey, getGetCaregiverQueryKey, getGetChatHistoryQueryKey,
  getGetCurrentLocationQueryKey, getGetDashboardQueryKey, getGetPatientProfileQueryKey, getListAppointmentsQueryKey,
  getListDoseStatusQueryKey, getListEmergencyHistoryQueryKey, getListMedicineOrdersQueryKey, getListMedicinesQueryKey,
  getListNotificationsQueryKey, getListPharmaciesQueryKey, getListHospitalsQueryKey, getListAmbulancesQueryKey,
  getSearchMedicinesQueryKey, useActivateEmergency, useCancelEmergency, useCreateAppointment, useCreateMedicine,
  useCreateMedicineOrder, useDeleteMedicine, useGetAdherenceReport, useGetAiRisk, useGetCaregiver, useGetChatHistory,
  useGetCurrentLocation, useGetDashboard, useGetPatientProfile, useListAmbulances, useListAppointments, useListDoseStatus,
  useListEmergencyHistory, useListHospitals, useListMedicineOrders, useListMedicines, useListNotifications, useListPharmacies,
  useMarkNotificationRead, useSearchMedicines, useSendChatMessage, useUpdateCaregiver, useUpdateDoseStatus, useUpdateLocation,
  useUpdateMedicine, useUpdatePatientProfile
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const client = new QueryClient();
type AuthUser = { id: number; fullName: string; email: string; role: 'patient' | 'caregiver' };
const authFetch = async (path: string, init?: RequestInit) => {
  const response = await fetch(`/api/auth${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'Unable to complete that request.');
  return payload;
};
const apiFetch = async (path: string, init?: RequestInit) => {
  const response = await fetch(`/api${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'Unable to complete that request.');
  return payload;
};
type SpeechFeedback = { kind: 'queued' | 'speaking' | 'done' | 'error'; message: string };
const spokenReminderIds = new Set<string>();

function preferredSpeechVoice(voices: SpeechSynthesisVoice[]) {
  if (!voices.length) return null;
  const locale = navigator.language.toLowerCase();
  const language = locale.split('-')[0];
  return voices.find((voice) => voice.default && voice.lang.toLowerCase() === locale)
    || voices.find((voice) => voice.lang.toLowerCase() === locale)
    || voices.find((voice) => voice.lang.toLowerCase().startsWith(`${language}-`))
    || voices.find((voice) => voice.default)
    || voices[0];
}

function supportsSpeechSynthesis() {
  return typeof window !== 'undefined'
    && Boolean(window.speechSynthesis)
    && typeof SpeechSynthesisUtterance !== 'undefined';
}

function speakReminder(message: string, reminderId: string, onFeedback: (feedback: SpeechFeedback) => void = () => {}) {
  if (!supportsSpeechSynthesis()) {
    onFeedback({ kind: 'error', message: 'Speech is unavailable in this browser. The text reminder is still shown.' });
    return;
  }
  if (spokenReminderIds.has(reminderId)) {
    onFeedback({ kind: 'queued', message: 'This reminder has already been queued.' });
    return;
  }

  const synthesis = window.speechSynthesis;
  spokenReminderIds.add(reminderId);
  let started = false;
  let voiceLoadTimeout: number | undefined;
  let voicesListener: (() => void) | undefined;
  const utterance = new SpeechSynthesisUtterance(message);
  const cleanup = () => {
    if (voiceLoadTimeout) window.clearTimeout(voiceLoadTimeout);
    if (voicesListener) synthesis.removeEventListener('voiceschanged', voicesListener);
    voiceLoadTimeout = undefined;
    voicesListener = undefined;
  };
  const applyVoice = (voices: SpeechSynthesisVoice[]) => {
    const voice = preferredSpeechVoice(voices);
    if (!voice) return false;
    utterance.voice = voice;
    utterance.lang = voice.lang || navigator.language;
    return true;
  };

  try {
    if (!applyVoice(synthesis.getVoices())) {
      voicesListener = () => {
        if (!started && applyVoice(synthesis.getVoices())) {
          if (voicesListener) synthesis.removeEventListener('voiceschanged', voicesListener);
          voicesListener = undefined;
        }
      };
      synthesis.addEventListener('voiceschanged', voicesListener);
      voiceLoadTimeout = window.setTimeout(() => {
        const voices = synthesis.getVoices();
        if (!started && voices.length) applyVoice(voices);
        if (!started && !synthesis.speaking && !synthesis.pending) {
          cleanup();
          onFeedback({
            kind: 'error',
            message: voices.length
              ? 'The browser did not start speech. Your text reminder is still shown; try Test Voice again.'
              : 'No browser voice is available. Your text reminder is still shown.',
          });
        }
      }, 7000);
    }

    utterance.onstart = () => {
      started = true;
      cleanup();
      onFeedback({ kind: 'speaking', message: 'Voice reminder is playing.' });
    };
    utterance.onend = () => {
      cleanup();
      onFeedback({ kind: 'done', message: 'Voice reminder finished.' });
    };
    utterance.onerror = (event) => {
      cleanup();
      const message = event.error === 'not-allowed'
        ? 'The browser blocked speech. Click Test Voice to allow audio, then try again.'
        : 'The browser could not play speech. The text reminder is still shown.';
      onFeedback({ kind: 'error', message });
    };
    onFeedback({
      kind: 'queued',
      message: synthesis.speaking || synthesis.pending ? 'Voice reminder queued behind the current alert.' : 'Starting voice reminder…',
    });
    // SpeechSynthesis queues utterances, so a new reminder never interrupts one already playing.
    synthesis.speak(utterance);
  } catch {
    cleanup();
    onFeedback({ kind: 'error', message: 'The browser could not start speech. Your text reminder is still shown.' });
  }
}
type PatientLocation = { latitude: number; longitude: number; accuracy?: number; updatedAt?: string };
type LocationContextValue = { location: PatientLocation | null; loading: boolean; error: string; refresh: () => Promise<PatientLocation | null> };
const LocationContext = createContext<LocationContextValue>({ location: null, loading: false, error: '', refresh: async () => null });
function PatientLocationProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<PatientLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const loadSaved = async () => {
    try {
      const user = await authFetch('/me');
      if (user.role !== 'patient') { setLocation(null); return; }
      const saved = await apiFetch('/location/current');
      setLocation(saved);
    } catch { setLocation(null); }
  };
  useEffect(() => {
    void loadSaved();
    window.addEventListener('pcai-auth-changed', loadSaved);
    return () => window.removeEventListener('pcai-auth-changed', loadSaved);
  }, []);
  const refresh = () => new Promise<PatientLocation | null>((resolve) => {
    setLoading(true);
    setError('');
    if (!navigator.geolocation) {
      const message = 'Location is not available in this browser.';
      setError(message); setLoading(false); resolve(null); return;
    }
    navigator.geolocation.getCurrentPosition(async (position) => {
      const next: PatientLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy };
      try {
        const saved = await apiFetch('/location/update', { method: 'POST', body: JSON.stringify(next) });
        setLocation(saved);
        setLoading(false);
        resolve(saved);
      } catch {
        setLocation(next);
        setError('Location was found, but could not be saved for nearby search.');
        setLoading(false);
        resolve(next);
      }
    }, (geoError) => {
      const message = geoError.code === geoError.PERMISSION_DENIED ? 'Location permission was denied. You can enable it in your browser settings and try again.' : geoError.code === geoError.POSITION_UNAVAILABLE ? 'Your device could not determine a location right now.' : 'Location took too long. Please try refreshing again.';
      setError(message); setLoading(false); resolve(null);
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  });
  return <LocationContext.Provider value={{ location, loading, error, refresh }}>{children}</LocationContext.Provider>;
}
function usePatientLocation() { return useContext(LocationContext); }

function MedicationReminderService() {
  const [notice, setNotice] = useState<any>(null);
  useEffect(() => {
    let stopped = false;
    let user: AuthUser | null = null;
    let voiceEnabled = false;
    let busy = false;
    let timer: number | undefined;
    const refreshSession = async () => {
      try {
        const me = await authFetch('/me');
        const previousUserId = user?.id;
        user = me.role === 'patient' ? me : null;
        if (!user || user.id !== previousUserId) setNotice(null);
        voiceEnabled = user ? localStorage.getItem(`pcai-voice-enabled:${user.id}`) === 'true' : false;
      } catch { user = null; voiceEnabled = false; setNotice(null); }
    };
    const onVoiceChange = () => {
      voiceEnabled = user ? localStorage.getItem(`pcai-voice-enabled:${user.id}`) === 'true' : false;
    };
    const announce = (medicine: any, scheduledTime: string, reminderId: string) => {
      const message = `Hello! It is time for your scheduled ${medicine.name} ${medicine.dosage} dose, scheduled at ${scheduledTime}. Please follow your prescribed medication schedule.`;
      setNotice({ id: reminderId, message, medicine: medicine.name, dosage: medicine.dosage, scheduledTime, voiceStatus: '' });
      if (voiceEnabled) {
        speakReminder(message, reminderId, (feedback) => {
          setNotice((current: any) => current?.id === reminderId ? { ...current, voiceStatus: feedback.message } : current);
        });
      }
      if ('Notification' in window && Notification.permission === 'granted') new Notification('Medication reminder', { body: `${medicine.name} ${medicine.dosage} · scheduled for ${scheduledTime}` });
    };
    const parseTime = (value: string) => {
      const match = value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
      if (!match) return null;
      let hours = Number(match[1]);
      const minutes = Number(match[2]);
      const period = match[3]?.toUpperCase();
      if (hours > 23 || minutes > 59) return null;
      if (period === 'PM' && hours < 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      return hours * 60 + minutes;
    };
    const check = async () => {
      if (busy || stopped) return;
      busy = true;
      try {
        if (!user) await refreshSession();
        if (user) {
          const medicines = await apiFetch('/medicines');
          const current = new Date();
          const currentMinute = current.getHours() * 60 + current.getMinutes();
          const today = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
          for (const medicine of medicines.filter((item: any) => item.active !== false)) {
            const dueMinute = parseTime(medicine.scheduledTime);
            if (dueMinute === null || currentMinute < dueMinute || currentMinute - dueMinute > 2) continue;
            const key = `pcai-reminder-fired:${user.id}:${today}:${medicine.id}:${dueMinute}`;
            if (localStorage.getItem(key)) continue;
            localStorage.setItem(key, 'true');
            announce(medicine, medicine.scheduledTime, key);
          }
        }
      } catch {
        // A logged-out session or temporary API failure should not block the app.
      } finally { busy = false; }
    };
    void check();
    timer = window.setInterval(() => { void check(); }, 15000);
    window.addEventListener('pcai-auth-changed', refreshSession);
    window.addEventListener('pcai-voice-change', onVoiceChange);
    return () => { stopped = true; if (timer) window.clearInterval(timer); window.removeEventListener('pcai-auth-changed', refreshSession); window.removeEventListener('pcai-voice-change', onVoiceChange); };
  }, []);
  if (!notice) return null;
  return <div role="status" aria-live="polite" className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-xl rounded-2xl border border-[hsl(var(--primary)/.3)] bg-[hsl(var(--card))] p-4 shadow-xl sm:bottom-6"><div className="flex items-start gap-3"><Bell className="mt-1 shrink-0 text-[hsl(var(--primary))]" /><div className="flex-1"><b>Medication reminder</b><p className="mt-1 text-sm">{notice.message}</p>{notice.voiceStatus && <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{notice.voiceStatus}</p>}</div><button onClick={() => setNotice(null)} className="rounded-lg p-2" aria-label="Dismiss reminder"><X size={16} /></button></div></div>;
}
const items = [
  ['/dashboard', 'Overview', Activity], ['/medicines', 'Medicines', Pill], ['/reminders', 'Reminders', Bell], ['/history', 'History', Clock3],
  ['/assistant', 'Care assistant', MessageCircle], ['/risk', 'Adherence risk', ShieldCheck], ['/caregiver', 'Care circle', Users],
  ['/hospitals', 'Hospitals', Hospital], ['/pharmacies', 'Pharmacies', ShoppingBag], ['/appointments', 'Appointments', CalendarDays], ['/orders', 'Medicine orders', ShoppingBag], ['/reports', 'Reports', BookOpen],
] as const;

function Logo() { return <Link href="/" className="flex items-center gap-3 focus-ring" data-testid="link-logo"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-[hsl(var(--primary))] text-white"><HeartPulse size={22} /></span><span><b className="display block text-[15px]">Parkinson Care</b><small className="text-[11px] text-[hsl(var(--muted-foreground))]">a calmer day, together</small></span></Link>; }
function Badge({ children, tone = 'teal' }: { children: ReactNode; tone?: string }) { const c: any = { teal: 'bg-[hsl(169_42%_37%/.1)] text-[hsl(var(--primary))]', amber: 'bg-[hsl(28_70%_67%/.2)] text-[hsl(28_56%_32%)]', red: 'bg-[hsl(4_66%_49%/.1)] text-[hsl(var(--destructive))]', slate: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]' }; return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.12em] ${c[tone] || c.teal}`}>{children}</span>; }
function Title({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: string; action?: ReactNode }) { return <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">{eyebrow}</p><h1 className="display text-3xl font-extrabold tracking-[-.05em] sm:text-4xl">{title}</h1>{detail && <p className="mt-2 max-w-2xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">{detail}</p>}</div>{action}</div>; }
function Async({ q, children, empty = false }: { q: any; children: ReactNode; empty?: boolean }) { if (q.isLoading) return <div className="space-y-3"><div className="h-24 animate-pulse rounded-2xl bg-[hsl(var(--muted))]" /><div className="h-24 animate-pulse rounded-2xl bg-[hsl(var(--muted))]" /></div>; if (q.error) return <div className="card p-8 text-center"><WifiOff className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]" /><b>We couldn't load this just now.</b><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Your information is safe. Try again when you are ready.</p><button onClick={() => q.refetch()} className="mt-4 min-h-11 rounded-xl bg-[hsl(var(--secondary))] px-4 text-sm font-bold" data-testid="button-retry">Try again</button></div>; if (empty) return <div className="card p-10 text-center"><HeartPulse className="mx-auto mb-3 text-[hsl(var(--primary))]" /><b>Nothing here yet</b><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">This space will fill as your care plan grows.</p></div>; return <>{children}</>; }
function Shell({ children }: { children: ReactNode }) { const [path] = useLocation(); const [open, setOpen] = useState(false); const profile = useGetPatientProfile(); const name = profile.data?.fullName || 'Patient'; const initials = name.split(' ').map((x: string) => x[0]).join('').slice(0, 2).toUpperCase(); const logout = async () => { await authFetch('/logout', { method: 'POST' }).catch(() => undefined); window.location.href = '/'; }; return <div className="shell-bg min-h-[100dvh]"><aside className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-[hsl(var(--border))] bg-[hsl(var(--background)/.97)] p-6 backdrop-blur-xl lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}><div className="flex h-full flex-col"><Logo /><div className="mt-10 flex-1"><p className="mb-3 px-3 text-[10px] font-extrabold uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">Your care space</p><nav className="space-y-1">{items.map(([href, label, Icon]) => <Link key={href} href={href} onClick={() => setOpen(false)} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold ${path === href ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]'}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={18} />{label}{path === href && <ChevronRight size={14} className="ml-auto" />}</Link>)}</nav></div><Link href="/emergency" className="mb-4 flex min-h-14 items-center gap-3 rounded-2xl border border-[hsl(4_66%_49%/.25)] bg-[hsl(4_66%_49%/.07)] px-4 text-sm font-bold text-[hsl(var(--destructive))]" data-testid="link-nav-emergency"><span className="grid h-8 w-8 place-items-center rounded-full bg-[hsl(var(--destructive))] text-white"><Siren size={16} /></span>Emergency help</Link><div className="border-t border-[hsl(var(--border))] pt-3"><Link href="/profile" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold text-[hsl(var(--muted-foreground))]" data-testid="link-profile"><UserRound size={17} />Profile</Link><Link href="/settings" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold text-[hsl(var(--muted-foreground))]" data-testid="link-settings"><Settings2 size={17} />Settings</Link><button onClick={logout} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold text-[hsl(var(--muted-foreground))]" data-testid="button-logout"><ArrowRight size={17} className="rotate-180" />Log out</button></div></div></aside>{open && <button onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-[hsl(201_31%_18%/.3)] lg:hidden" aria-label="Close menu" data-testid="button-close-menu" />}<main className="lg:pl-72"><header className="sticky top-0 z-20 border-b border-[hsl(var(--border)/.8)] bg-[hsl(var(--background)/.88)] px-4 py-4 backdrop-blur-xl sm:px-8"><div className="mx-auto flex max-w-6xl items-center"><button onClick={() => setOpen(true)} className="grid h-11 w-11 place-items-center rounded-xl bg-[hsl(var(--card))] lg:hidden" aria-label="Open menu" data-testid="button-open-menu"><Menu size={20} /></button><span className="ml-3 hidden text-sm text-[hsl(var(--muted-foreground))] sm:block">Your private care space · {name}</span><div className="ml-auto flex items-center gap-2"><Badge>Private care space</Badge><Link href="/profile" className="grid h-10 w-10 place-items-center rounded-full bg-[hsl(var(--secondary))] text-sm font-extrabold text-[hsl(var(--primary))]" data-testid="link-avatar" aria-label={`Open profile for ${name}`}>{initials}</Link></div></div></header><div className="mx-auto max-w-6xl px-4 py-8 pb-28 sm:px-8 lg:pb-10">{children}</div></main><nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-[hsl(var(--border))] bg-[hsl(var(--card)/.96)] p-2 lg:hidden">{[...items.slice(0, 4), ['/emergency', 'SOS', Siren] as const].map(([href, label, Icon]) => <Link key={href} href={href} className={`grid min-h-12 min-w-14 place-items-center gap-0.5 rounded-xl text-[10px] font-bold ${path === href ? 'text-[hsl(var(--primary))]' : href === '/emergency' ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]'}`} data-testid={`link-mobile-${label}`}><Icon size={18} /><span>{label.split(' ')[0]}</span></Link>)}</nav></div>; }

function Landing() { return <div className="min-h-[100dvh]"><header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8"><Logo /><Link href="/register" className="flex min-h-11 items-center rounded-xl bg-[hsl(var(--primary))] px-5 text-sm font-bold text-white" data-testid="link-register">Create care space</Link></header><section className="mx-auto grid max-w-6xl gap-12 px-5 pb-24 pt-16 sm:px-8 lg:grid-cols-[1.02fr_.98fr] lg:items-center lg:pt-24"><div><Badge>Made for steadier days</Badge><h1 className="display mt-6 max-w-2xl text-5xl font-extrabold leading-[1.02] tracking-[-.07em] sm:text-7xl">Care that keeps its voice <span className="text-[hsl(var(--primary))]">soft.</span></h1><p className="mt-7 max-w-xl text-lg leading-8 text-[hsl(var(--muted-foreground))]">Medicines, routines, trusted people, and reassurance in one clear place — for patients and the people beside them.</p><div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/register" className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] px-6 font-bold text-white" data-testid="link-start">Create your care space <ArrowRight size={18} /></Link><Link href="/login" className="flex min-h-14 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 font-bold" data-testid="link-login">I already have a space</Link></div><p className="mt-5 text-xs text-[hsl(var(--muted-foreground))]">Your account is protected; provider integrations remain disabled in demo mode.</p></div><div className="card soft-grid p-5 sm:p-8"><div className="flex justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[hsl(var(--primary))]">A calmer view</p><h2 className="display mt-2 text-2xl font-extrabold">A gentle plan for today</h2></div><Sun className="text-[hsl(var(--accent))]" /></div><div className="mt-7 rounded-2xl bg-[hsl(var(--secondary))] p-4"><div className="flex justify-between"><b>Next medicine</b><Badge tone="amber">After sign in</Badge></div><div className="mt-4 flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-xl bg-[hsl(var(--card))] text-[hsl(var(--primary))]"><Pill /></span><div><b>Your medication schedule</b><p className="text-sm text-[hsl(var(--muted-foreground))]">Personalized after you sign in</p></div></div></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-[hsl(var(--border))] p-4"><small>Today's adherence</small><strong className="display mt-1 block text-3xl text-[hsl(var(--primary))]">—</strong></div><div className="rounded-2xl border border-[hsl(var(--border))] p-4"><small>Care circle</small><strong className="display mt-1 block text-3xl">—</strong></div></div><div className="mt-4 flex gap-3 rounded-2xl border border-[hsl(var(--border))] p-4 text-sm"><Check className="text-[hsl(var(--primary))]" /><span><b>Designed around your privacy.</b><br /><small>Your information appears after sign in.</small></span></div></div></section><section className="border-y border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.4)] px-5 py-20 sm:px-8"><div className="mx-auto max-w-6xl"><p className="text-center text-xs font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">A calmer rhythm in three parts</p><div className="mt-10 grid gap-4 md:grid-cols-3">{[['See the plan', 'Simple dose windows, reminders, and history without the clutter.', Pill], ['Keep people close', 'Give a caregiver the right visibility, with your permission.', Users], ['Know where help is', 'A clear SOS path and integration-safe language.', LifeBuoy]].map(([a, b, Icon]) => { const I = Icon as any; const title = a as string; const desc = b as string; return <div className="card p-6" key={title}><span className="grid h-11 w-11 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><I /></span><h3 className="display mt-5 text-lg font-extrabold">{title}</h3><p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{desc}</p></div>; })}</div></div></section></div>; }
function Auth({ register = false, caregiver = false }: { register?: boolean; caregiver?: boolean }) {
  const [, go] = useLocation();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (register && form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const result = await authFetch(register ? '/register' : '/login', { method: 'POST', body: JSON.stringify(register ? { fullName: form.fullName, email: form.email, password: form.password, role: caregiver ? 'caregiver' : 'patient' } : { email: form.email, password: form.password }) });
      window.dispatchEvent(new Event('pcai-auth-changed'));
      if (register) {
        setMessage('Your account is ready. Sign in to continue.');
        setForm({ fullName: '', email: form.email, password: '', confirmPassword: '' });
        window.setTimeout(() => go(caregiver ? '/caregiver-login' : '/login'), 600);
      } else {
        go(result.role === 'caregiver' ? '/caregiver-dashboard' : '/dashboard');
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };
  const demo = async () => {
    setBusy(true);
    setError('');
    try {
      await authFetch('/login', { method: 'POST', body: JSON.stringify({ email: 'demo@parkinsoncare.ai', password: 'demo12345' }) });
      window.dispatchEvent(new Event('pcai-auth-changed'));
      go('/dashboard');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to open the demo.');
    } finally {
      setBusy(false);
    }
  };
  return <div className="grid min-h-[100dvh] lg:grid-cols-[.8fr_1.2fr]"><div className="hidden bg-[hsl(var(--primary))] p-12 text-white lg:flex lg:flex-col lg:justify-between"><Logo /><div><p className="text-sm font-bold uppercase tracking-[.16em] text-white/70">A private first step</p><h1 className="display mt-5 max-w-md text-5xl font-extrabold leading-tight">Take the next step at your own pace.</h1><p className="mt-6 max-w-sm leading-7 text-white/75">Your care space keeps medication routines, trusted people, and urgent support together.</p></div><small>Parkinson Care AI · protected care space</small></div><div className="flex items-center justify-center p-5 sm:p-10"><form onSubmit={submit} className="w-full max-w-md"><Logo /><Badge tone="amber">{register ? `Create a ${caregiver ? 'caregiver' : 'patient'} account` : `${caregiver ? 'Caregiver' : 'Secure'} sign in`}</Badge><h1 className="display mt-5 text-3xl font-extrabold">{register ? 'Create your account' : caregiver ? 'Caregiver sign in' : 'Welcome back'}</h1><p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{register ? `Set up your ${caregiver ? 'caregiver' : 'private Parkinson Care AI'} account.` : caregiver ? 'Sign in to review accepted patient connections and invitations.' : 'Sign in to your Parkinson Care AI account.'}</p>{register && <label className="mt-8 block text-sm font-bold">Full name<input required value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} className="mt-2 min-h-12 w-full rounded-xl border border-[hsl(var(--input))] px-4" placeholder="Your name" data-testid="input-name" /></label>}<label className={`${register ? 'mt-4' : 'mt-8'} block text-sm font-bold`}>Email<input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="mt-2 min-h-12 w-full rounded-xl border border-[hsl(var(--input))] px-4" placeholder="you@example.com" data-testid="input-email" /></label><label className="mt-4 block text-sm font-bold">Password<input required minLength={8} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="mt-2 min-h-12 w-full rounded-xl border border-[hsl(var(--input))] px-4" placeholder="At least 8 characters" data-testid="input-password" /></label>{register && <label className="mt-4 block text-sm font-bold">Confirm password<input required minLength={8} type="password" value={form.confirmPassword} onChange={e => setForm({ ...form, confirmPassword: e.target.value })} className="mt-2 min-h-12 w-full rounded-xl border border-[hsl(var(--input))] px-4" placeholder="Repeat your password" data-testid="input-confirm-password" /></label>}{error && <p role="alert" className="mt-4 rounded-xl bg-[hsl(4_66%_49%/.1)] p-3 text-sm font-semibold text-[hsl(var(--destructive))]">{error}</p>}{message && <p role="status" className="mt-4 rounded-xl bg-[hsl(var(--secondary))] p-3 text-sm font-semibold text-[hsl(var(--primary))]">{message}</p>}<button disabled={busy} className="mt-6 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] font-bold text-white disabled:opacity-60" data-testid="button-continue">{busy ? 'Please wait…' : register ? 'Create account' : 'Log in'} <ArrowRight size={17} /></button>{!register && !caregiver && <><div className="mt-4 text-center"><button type="button" onClick={() => setMessage('Password recovery is available once an email provider is connected.')} className="text-sm font-bold text-[hsl(var(--primary))]" data-testid="button-forgot-password">Forgot password?</button></div><button type="button" onClick={demo} disabled={busy} className="mt-4 min-h-12 w-full rounded-xl border border-[hsl(var(--border))] font-bold disabled:opacity-60" data-testid="button-demo-login">Continue as Demo Patient</button></>}<div className="mt-6 text-center text-sm text-[hsl(var(--muted-foreground))]">{register ? 'Already have an account?' : caregiver ? 'Are you a patient?' : 'Are you a caregiver?'} <Link href={register ? (caregiver ? '/caregiver-login' : '/login') : (caregiver ? '/login' : '/caregiver-login')} className="font-bold text-[hsl(var(--primary))]" data-testid="link-switch-auth">{register ? 'Log in' : caregiver ? 'Patient sign in' : 'Caregiver sign in'}</Link></div>{!caregiver && <div className="mt-8 flex gap-3 rounded-xl bg-[hsl(var(--secondary))] p-4 text-xs leading-5 text-[hsl(var(--muted-foreground))]"><ShieldCheck size={16} className="text-[hsl(var(--primary))]" /> Your session is protected. External healthcare providers are not contacted by this app.</div>}</form></div></div>;
}

function Dashboard() { const q = useGetDashboard(); const n = useListNotifications(); const dose = useUpdateDoseStatus(); const mark = useMarkNotificationRead(); const qc = useQueryClient(); const d: any = q.data; const stats = d?.stats; const next = d?.nextDose; return <Shell><Title eyebrow={d?.greeting || 'Good morning'} title={d?.patientName ? `Hello, ${d.patientName}` : 'Your day, gently organized'} detail="A simple view of what matters now. You are never expected to do everything at once." action={<Link href="/emergency" className="flex min-h-12 items-center gap-2 rounded-xl border border-[hsl(4_66%_49%/.3)] bg-[hsl(4_66%_49%/.07)] px-4 text-sm font-bold text-[hsl(var(--destructive))]" data-testid="link-dashboard-sos"><Siren size={17} /> Emergency help</Link>} /><Async q={q}><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['Today', stats?.todayDoses], ['Taken', stats?.takenDoses], ['To go', stats?.pendingDoses], ['Adherence', stats?.adherence ? `${Math.round(stats.adherence)}%` : '—']].map(([a, b], i) => <div className="card p-5" key={String(a)} data-testid={`stat-${i}`}><small className="text-[hsl(var(--muted-foreground))]">{a}</small><strong className="display mt-3 block text-3xl">{b ?? '—'}</strong><small className="text-[hsl(var(--primary))]">{a === 'Adherence' ? 'last 7 days' : 'doses'}</small></div>)}</div><div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_.7fr]"><section className="card p-6"><Badge tone="amber">Next dose</Badge><h2 className="display mt-3 text-2xl font-extrabold">{next?.medicineName || 'You are all set for now'}</h2><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{next ? `${next.dosage} · ${next.scheduledTime}` : 'Upcoming doses appear here.'}</p>{next && <div className="mt-6 flex gap-3"><button onClick={() => dose.mutate({ data: { doseId: next.id, status: 'taken' } }, { onSuccess: () => qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }) })} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] font-bold text-white" data-testid="button-mark-taken"><Check size={17} /> Mark taken</button><button onClick={() => dose.mutate({ data: { doseId: next.id, status: 'missed' } }, { onSuccess: () => qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }) })} className="min-h-12 rounded-xl border border-[hsl(var(--border))] px-4 font-bold" data-testid="button-mark-missed">I missed this</button></div>}<div className="mt-6 flex gap-3 rounded-xl bg-[hsl(var(--secondary))] p-4 text-sm"><ShieldCheck className="text-[hsl(var(--primary))]" size={18} /> Small, steady actions are enough.</div></section><section className="card p-6"><h2 className="display text-lg font-extrabold">Recent activity</h2><div className="mt-5 space-y-4">{d?.recentActivity?.slice(0, 4).map((x: any) => <div className="flex gap-3" key={x.id}><span className="mt-1 h-2.5 w-2.5 rounded-full bg-[hsl(var(--primary))]" /><div><b className="text-sm">{x.title}</b><p className="text-xs text-[hsl(var(--muted-foreground))]">{x.detail}</p></div></div>) || <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">Your activity will appear here.</p>}</div></section></div><section className="card mt-6 p-6"><div className="flex justify-between"><div><h2 className="display text-lg font-extrabold">Notifications</h2><p className="text-sm text-[hsl(var(--muted-foreground))]">A quiet inbox for things worth noticing.</p></div><Bell className="text-[hsl(var(--primary))]" /></div><Async q={n} empty={!n.data?.length}><div className="mt-5 grid gap-3 md:grid-cols-2">{n.data?.slice(0, 4).map((x: any) => <button onClick={() => mark.mutate({ id: x.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() }) })} className="flex min-h-16 gap-3 rounded-xl border border-[hsl(var(--border))] p-4 text-left" key={x.id} data-testid={`button-notification-${x.id}`}><span className="mt-1 h-2 w-2 rounded-full bg-[hsl(var(--primary))]" /><span><b className="block text-sm">{x.title}</b><small className="text-xs text-[hsl(var(--muted-foreground))]">{x.message}</small></span></button>)}</div></Async></section></Async></Shell>; }

function Medicines() { const q = useListMedicines(); const ds = useListDoseStatus(); const create = useCreateMedicine(); const update = useUpdateMedicine(); const del = useDeleteMedicine(); const qc = useQueryClient(); const [edit, setEdit] = useState<any>(null); const [form, setForm] = useState<any>({ name: '', dosage: '', type: 'Tablet', scheduledTime: '08:00', frequency: 'Daily', instructions: '' }); const save = (e: any) => { e.preventDefault(); const done = () => { setEdit(null); qc.invalidateQueries({ queryKey: getListMedicinesQueryKey() }); }; edit?.id ? update.mutate({ id: edit.id, data: form }, { onSuccess: done }) : create.mutate({ data: form }, { onSuccess: done }); }; const open = (m: any = null) => { setEdit(m || {}); setForm(m ? { ...m } : { name: '', dosage: '', type: 'Tablet', scheduledTime: '08:00', frequency: 'Daily', instructions: '' }); }; return <Shell><Title eyebrow="Your plan" title="Medicines" detail="Keep your medication plan current and easy to read." action={<button onClick={() => open()} className="flex min-h-12 items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-white" data-testid="button-add-medicine"><Plus size={17} /> Add medicine</button>} />{edit && <form onSubmit={save} className="card mb-6 grid gap-4 p-6 sm:grid-cols-2"><h2 className="display text-xl font-extrabold sm:col-span-2">{edit.id ? 'Edit medicine' : 'Add a medicine'}</h2>{[['name', 'Medicine name'], ['dosage', 'Dose'], ['scheduledTime', 'Scheduled time'], ['frequency', 'Frequency']].map(([key, label]) => <label className="text-sm font-bold" key={key}>{label}<input required type={key === 'scheduledTime' ? 'time' : 'text'} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} className="mt-2 min-h-12 w-full rounded-xl border border-[hsl(var(--input))] px-3" data-testid={`input-medicine-${key}`} /></label>)}<label className="text-sm font-bold sm:col-span-2">Instructions<textarea value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} className="mt-2 min-h-20 w-full rounded-xl border border-[hsl(var(--input))] p-3" data-testid="input-medicine-instructions" /></label><div className="flex gap-3 sm:col-span-2"><button className="min-h-12 flex-1 rounded-xl bg-[hsl(var(--primary))] font-bold text-white" data-testid="button-save-medicine">Save medicine</button><button type="button" onClick={() => setEdit(null)} className="min-h-12 rounded-xl border px-5 font-bold" data-testid="button-cancel-medicine">Cancel</button></div></form>}<Async q={q} empty={!q.data?.length}><div className="grid gap-4 lg:grid-cols-2">{q.data?.map((m: any) => <div className="card p-5" key={m.id} data-testid={`card-medicine-${m.id}`}><div className="flex justify-between"><div className="flex gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Pill /></span><div><h2 className="display text-lg font-extrabold">{m.name}</h2><p className="text-sm text-[hsl(var(--muted-foreground))]">{m.dosage} · {m.type}</p></div></div><button onClick={() => open(m)} data-testid={`button-edit-medicine-${m.id}`}><Pencil size={17} /></button></div><div className="mt-5 grid grid-cols-2 rounded-xl bg-[hsl(var(--muted))] p-3 text-sm"><span><small className="block">Next scheduled</small><b>{m.scheduledTime}</b></span><span><small className="block">Frequency</small><b>{m.frequency}</b></span></div><div className="mt-4 flex justify-between text-xs text-[hsl(var(--muted-foreground))]"><span>{ds.data?.filter((x: any) => x.medicineId === m.id && x.status === 'taken').length || 0} taken today</span><button onClick={() => { if (window.confirm(`Remove ${m.name}?`)) del.mutate({ id: m.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListMedicinesQueryKey() }) }); }} className="flex items-center gap-1 font-bold text-[hsl(var(--destructive))]" data-testid={`button-delete-medicine-${m.id}`}><Trash2 size={14} /> Remove</button></div></div>)}</div></Async></Shell>; }

function History() { const q = useListDoseStatus(); const [f, setF] = useState('all'); const rows = q.data?.filter((x: any) => f === 'all' || x.status === f) || []; return <Shell><Title eyebrow="A useful record" title="Medication history" detail="Look back for patterns, not for perfection." action={<select value={f} onChange={e => setF(e.target.value)} className="min-h-11 rounded-xl border border-[hsl(var(--input))] px-3 text-sm font-bold" data-testid="select-history"><option value="all">All doses</option><option value="taken">Taken</option><option value="missed">Missed</option><option value="pending">Upcoming</option></select>} /><Async q={q} empty={!rows.length}><div className="card overflow-hidden">{rows.map((x: any) => <div key={x.id} className="grid gap-2 border-b border-[hsl(var(--border))] p-5 last:border-0 sm:grid-cols-[1.4fr_1fr_1fr_.7fr] sm:items-center"><div><b>{x.medicineName}</b><small className="block text-[hsl(var(--muted-foreground))]">{x.dosage}</small></div><span className="text-sm text-[hsl(var(--muted-foreground))]">{x.date}</span><span className="text-sm text-[hsl(var(--muted-foreground))]">{x.scheduledTime}</span><Badge tone={x.status === 'missed' ? 'red' : x.status === 'taken' ? 'teal' : 'amber'}>{x.status}</Badge></div>)}</div></Async></Shell>; }

function Assistant() { const q = useGetChatHistory(); const send = useSendChatMessage(); const qc = useQueryClient(); const [text, setText] = useState(''); const prompts = ['What should I know about my next dose?', 'Help me prepare for a doctor visit', 'I feel unsteady today']; const submit = (message = text) => { if (!message.trim()) return; send.mutate({ data: { message } }, { onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: getGetChatHistoryQueryKey() }); } }); }; return <Shell><Title eyebrow="Here to help you think it through" title="Care assistant" detail="Ask about routines, medicines, or what to bring to your next appointment." /><div className="grid gap-6 lg:grid-cols-[1fr_300px]"><section className="card flex min-h-[560px] flex-col p-5 sm:p-7"><div className="flex items-center gap-3 border-b border-[hsl(var(--border))] pb-5"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><MessageCircle /></span><div><b className="display">Your care companion</b><small className="block text-[hsl(var(--muted-foreground))]">Clear answers, never a diagnosis</small></div></div><div className="flex-1 space-y-3 overflow-auto py-6">{q.data?.map((m: any) => <div className={`flex ${m.role === 'user' ? 'justify-end' : ''}`} key={m.id}><div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 ${m.role === 'user' ? 'bg-[hsl(var(--primary))] text-white' : 'bg-[hsl(var(--secondary))]'}`}>{m.message}</div></div>) || <div className="flex h-full flex-col items-center justify-center text-center"><HeartPulse className="text-[hsl(var(--primary))]" /><h3 className="display mt-4 text-xl font-extrabold">Start with a question</h3><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">I can help organize information to discuss with your care team.</p></div>}</div><div className="border-t border-[hsl(var(--border))] pt-4"><div className="flex gap-2 overflow-auto pb-3">{prompts.map((p, i) => <button onClick={() => submit(p)} className="shrink-0 rounded-full border px-3 py-2 text-xs font-bold" key={p} data-testid={`button-prompt-${i}`}>{p}</button>)}</div><div className="flex gap-2"><input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} className="min-h-12 flex-1 rounded-xl border border-[hsl(var(--input))] px-4" placeholder="Write a question..." data-testid="input-chat" /><button onClick={() => submit()} className="grid h-12 w-12 place-items-center rounded-xl bg-[hsl(var(--primary))] text-white" data-testid="button-send-chat"><Send size={17} /></button></div></div></section><aside className="card p-5"><Badge tone="amber">Safety first</Badge><p className="mt-4 text-sm leading-6 text-[hsl(var(--muted-foreground))]">This assistant shares general information, not medical advice. For urgent symptoms, call local emergency services.</p></aside></div></Shell>; }

function Risk() { const q = useGetAiRisk(); const r: any = q.data; return <Shell><Title eyebrow="A little context, not a label" title="Adherence risk" detail="A view of missed and pending doses to help decide where support may help." /><Async q={q}><div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]"><section className="card p-7"><Badge tone={r?.riskLevel?.toLowerCase() === 'high' ? 'red' : 'amber'}>{r?.riskLevel || 'Reviewing'}</Badge><p className="display mt-6 text-6xl font-extrabold text-[hsl(var(--primary))]">{r?.adherence != null ? Math.round(r.adherence) : '—'}<span className="text-2xl">%</span></p><b>recent adherence</b><div className="mt-7 h-3 rounded-full bg-[hsl(var(--muted))]"><div className="h-full rounded-full bg-[hsl(var(--primary))]" style={{ width: `${r?.adherence || 0}%` }} /></div><p className="mt-4 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{r?.explanation}</p></section><section className="card p-7"><h2 className="display text-xl font-extrabold">A gentle recommendation</h2><p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{r?.recommendation || 'Keep your next dose visible and ask your care circle for support when a routine feels hard.'}</p><div className="mt-7 grid gap-3 sm:grid-cols-3">{[['Taken', r?.takenDoses], ['Missed', r?.missedDoses], ['Pending', r?.pendingDoses]].map(([a, b]) => <div className="rounded-xl bg-[hsl(var(--muted))] p-4" key={String(a)}><small>{a}</small><strong className="display mt-2 block text-3xl">{b ?? '—'}</strong></div>)}</div></section></div></Async></Shell>; }

function Caregiver() {
  const [connections, setConnections] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', email: '', phone: '', relationship: 'Daughter' });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => apiFetch('/caregiver/connections').then(setConnections).catch((e) => setError(e instanceof Error ? e.message : 'Unable to load caregiver connections.'));
  useEffect(() => { load(); }, []);
  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiFetch('/caregiver/connections', { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', email: '', phone: '', relationship: 'Daughter' });
      setOpen(false);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create the invitation.');
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (id: number) => {
    if (!window.confirm('Revoke this caregiver’s access?')) return;
    await apiFetch(`/caregiver/connections/${id}/revoke`, { method: 'PATCH' });
    await load();
  };
  return <Shell><Title eyebrow="Support, with permission" title="Care circle" detail="Only caregivers you explicitly invite can request access. Accepted connections can be revoked at any time." action={<button onClick={() => setOpen(!open)} className="flex min-h-12 items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-white" data-testid="button-add-caregiver"><Plus size={17} /> Add caregiver</button>} />{error && <p role="alert" className="mb-5 rounded-xl bg-[hsl(4_66%_49%/.1)] p-4 text-sm font-semibold text-[hsl(var(--destructive))]">{error}</p>}{open && <form onSubmit={invite} className="card mb-6 grid gap-4 p-6 sm:grid-cols-2"><h2 className="display text-xl font-extrabold sm:col-span-2">Invite a caregiver</h2><p className="text-sm leading-6 text-[hsl(var(--muted-foreground))] sm:col-span-2">They will receive an in-app invitation and must accept it before seeing anything about your care plan.</p><label className="text-sm font-bold">Full name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-2 min-h-12 w-full rounded-xl border px-3" data-testid="input-caregiver-name" /></label><label className="text-sm font-bold">Email<input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="mt-2 min-h-12 w-full rounded-xl border px-3" data-testid="input-caregiver-email" /></label><label className="text-sm font-bold">Phone<input required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="mt-2 min-h-12 w-full rounded-xl border px-3" data-testid="input-caregiver-phone" /></label><label className="text-sm font-bold">Relationship<select value={form.relationship} onChange={e => setForm({ ...form, relationship: e.target.value })} className="mt-2 min-h-12 w-full rounded-xl border px-3" data-testid="select-caregiver-relationship"><option>Parent</option><option>Spouse</option><option>Son</option><option>Daughter</option><option>Relative</option><option>Other</option></select></label><div className="flex gap-3 sm:col-span-2"><button disabled={busy} className="min-h-12 flex-1 rounded-xl bg-[hsl(var(--primary))] font-bold text-white disabled:opacity-50" data-testid="button-send-caregiver-invite">{busy ? 'Sending…' : 'Create invitation'}</button><button type="button" onClick={() => setOpen(false)} className="min-h-12 rounded-xl border px-5 font-bold">Cancel</button></div></form>}<div className="grid gap-4 lg:grid-cols-2">{connections.length ? connections.map((connection: any) => <section className="card p-6" key={connection.id}><div className="flex items-start justify-between gap-4"><div><Badge tone={connection.status === 'Accepted' ? 'teal' : connection.status === 'Revoked' || connection.status === 'Rejected' ? 'red' : 'amber'}>{connection.status}</Badge><h2 className="display mt-3 text-xl font-extrabold">{connection.caregiverName}</h2><p className="text-sm text-[hsl(var(--muted-foreground))]">{connection.relationship} · {connection.caregiverEmail}</p></div><Users className="text-[hsl(var(--primary))]" /></div><p className="mt-5 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{connection.status === 'Pending' ? 'Invitation created. They must accept it from their caregiver account before access is granted.' : connection.status === 'Accepted' ? 'This caregiver can see the care information you have authorized.' : 'This connection cannot access your information.'}</p>{(connection.status === 'Pending' || connection.status === 'Accepted') && <button onClick={() => revoke(connection.id)} className="mt-5 min-h-11 rounded-xl border border-[hsl(4_66%_49%/.25)] px-4 text-sm font-bold text-[hsl(var(--destructive))]" data-testid={`button-revoke-caregiver-${connection.id}`}>{connection.status === 'Pending' ? 'Cancel invitation' : 'Revoke access'}</button>}</section>) : <div className="card p-10 text-center lg:col-span-2"><Users className="mx-auto mb-3 text-[hsl(var(--primary))]" /><b>No caregivers connected yet</b><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Add someone you trust. They will not see anything until they accept.</p></div>}</div><section className="card mt-6 p-6"><h2 className="display text-xl font-extrabold">What an accepted caregiver can see</h2><p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Today’s medication schedule, dose status, adherence and risk information, medication history, reminders, and emergency SOS alerts. Your private profile and unrelated patient information stay hidden.</p></section></Shell>;
}

function Emergency() { const loc = useGetCurrentLocation(); const h = useListEmergencyHistory(); const amb = useListAmbulances(); const activate = useActivateEmergency(); const cancel = useCancelEmergency(); const save = useUpdateLocation(); const qc = useQueryClient(); const [active, setActive] = useState(false); const locate = () => navigator.geolocation?.getCurrentPosition(p => save.mutate({ data: { latitude: p.coords.latitude, longitude: p.coords.longitude } }, { onSuccess: () => qc.invalidateQueries({ queryKey: getGetCurrentLocationQueryKey() }) }), () => undefined); const sos = () => { if (!window.confirm('Start the demo SOS flow? No emergency service will be contacted.')) return; const run = (data?: any) => activate.mutate({ data }, { onSuccess: () => { setActive(true); qc.invalidateQueries({ queryKey: getListEmergencyHistoryQueryKey() }); } }); navigator.geolocation?.getCurrentPosition(p => run({ latitude: p.coords.latitude, longitude: p.coords.longitude }), () => run(undefined)); }; return <Shell><Title eyebrow="Visible when you need it" title="Emergency help" detail="Rehearse the flow safely. This does not contact dispatch, SMS, WhatsApp, or a hospital." /><div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]"><section className="card border-[hsl(4_66%_49%/.25)] p-7"><Badge tone="red">Demo SOS</Badge><h2 className="display mt-3 text-2xl font-extrabold">Need urgent help?</h2><p className="mt-4 text-sm leading-6 text-[hsl(var(--muted-foreground))]">If you are in immediate danger, call your local emergency number first.</p><button onClick={sos} disabled={active} className="mt-7 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[hsl(var(--destructive))] text-lg font-extrabold text-white disabled:opacity-50" data-testid="button-sos"><Siren />{active ? 'Demo alert is active' : 'Start SOS flow'}</button>{active && <button onClick={() => { const x: any = h.data?.[0]; if (x) cancel.mutate({ id: x.id }, { onSuccess: () => { setActive(false); qc.invalidateQueries({ queryKey: getListEmergencyHistoryQueryKey() }); } }); }} className="mt-3 min-h-12 w-full rounded-xl border font-bold" data-testid="button-cancel-sos">Cancel demo alert</button>}<div className="mt-6 rounded-xl bg-[hsl(var(--muted))] p-4 text-xs leading-5"><b>Integration required.</b> No message or dispatch request is sent.</div></section><div className="space-y-6"><section className="card p-6"><Badge tone={loc.data ? 'teal' : 'amber'}>{loc.data ? 'Location ready' : 'Location optional'}</Badge><h2 className="display mt-3 text-xl font-extrabold">Location status</h2><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{(loc.data as any)?.address || 'No current location shared'}</p><button onClick={locate} className="mt-5 min-h-11 rounded-xl bg-[hsl(var(--secondary))] px-4 text-sm font-bold text-[hsl(var(--primary))]" data-testid="button-use-location"><LocateFixed size={15} /> Use browser location</button></section><section className="card p-6"><h2 className="display text-xl font-extrabold">Nearby services</h2>{amb.data?.slice(0, 3).map((x: any) => <div className="mt-3 flex justify-between rounded-xl bg-[hsl(var(--muted))] p-3 text-sm" key={x.id}><span><b>{x.name}</b><small className="block">{x.distance}</small></span><Badge tone="slate">{x.integrationStatus || 'Integration required'}</Badge></div>) || <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">Connected provider needed.</p>}</section></div></div><section className="card mt-6 p-6"><h2 className="display text-xl font-extrabold">Event history</h2>{h.data?.map((x: any) => <div className="mt-4 flex justify-between border-b pb-3 text-sm" key={x.id}><span><b>{x.status}</b><small className="block text-[hsl(var(--muted-foreground))]">{x.createdAt}</small></span><Badge tone="amber">{x.notificationStatus || 'Integration required'}</Badge></div>) || <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">No emergency events in this space.</p>}</section></Shell>; }

function Hospitals() { const q = useListHospitals(); const ap = useListAppointments(); const create = useCreateAppointment(); const qc = useQueryClient(); const [place, setPlace] = useState<any>(null); const [f, setF] = useState<any>({}); return <Shell><Title eyebrow="Care nearby" title="Hospitals" detail="Browse connected directory results. Confirmation still happens outside this demo." /><Async q={q} empty={!q.data?.length}><div className="grid gap-4 lg:grid-cols-2">{q.data?.map((p: any) => <div className="card p-5" key={p.id}><div className="flex justify-between"><Hospital className="text-[hsl(var(--primary))]" /><Badge tone="slate">{p.integrationStatus || 'Integration required'}</Badge></div><h2 className="display mt-5 text-xl font-extrabold">{p.name}</h2><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{p.address} · {p.distance}</p><button onClick={() => { setPlace(p); setF({ placeId: p.id }); }} className="mt-5 min-h-11 w-full rounded-xl bg-[hsl(var(--secondary))] font-bold text-[hsl(var(--primary))]" data-testid={`button-appointment-${p.id}`}><CalendarDays size={16} /> Request appointment</button></div>)}</div></Async>{place && <form onSubmit={e => { e.preventDefault(); create.mutate({ data: f }, { onSuccess: () => { setPlace(null); qc.invalidateQueries({ queryKey: getListAppointmentsQueryKey() }); } }); }} className="card mt-6 grid gap-4 p-6 sm:grid-cols-2"><h2 className="display text-xl font-extrabold sm:col-span-2">Request at {place.name}</h2>{['doctorOrDepartment', 'date', 'time', 'reason'].map(k => <input required key={k} type={k === 'date' ? 'date' : k === 'time' ? 'time' : 'text'} placeholder={k} className="min-h-12 rounded-xl border px-3" value={f[k] || ''} onChange={e => setF({ ...f, [k]: e.target.value })} data-testid={`input-appointment-${k}`} />)}<button className="min-h-12 rounded-xl bg-[hsl(var(--primary))] font-bold text-white sm:col-span-2" data-testid="button-submit-appointment">Send request for review</button></form>}<section className="card mt-6 p-6"><h2 className="display text-lg font-extrabold">Your requests</h2>{ap.data?.map((x: any) => <div className="mt-3 flex justify-between rounded-xl bg-[hsl(var(--muted))] p-4 text-sm" key={x.id}><span><b>{x.hospitalName}</b><small className="block">{x.date} · {x.doctorOrDepartment}</small></span><Badge tone="amber">{x.status}</Badge></div>) || <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">No requests yet.</p>}</section></Shell>; }

function Pharmacies() { const [term, setTerm] = useState(''); const q = useListPharmacies(); const search = useSearchMedicines({ query: term || undefined }, { query: { enabled: term.length > 1, queryKey: getSearchMedicinesQueryKey({ query: term }) } }); const orders = useListMedicineOrders(); const order = useCreateMedicineOrder(); const qc = useQueryClient(); const [chosen, setChosen] = useState<any>(null); return <Shell><Title eyebrow="Plan ahead" title="Pharmacies" detail="Find nearby options and make a request. Inventory, payment, and delivery are not connected." /><section className="card p-6"><div className="flex gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-3.5 text-[hsl(var(--muted-foreground))]" size={17} /><input value={term} onChange={e => setTerm(e.target.value)} className="min-h-12 w-full rounded-xl border pl-10 pr-3" placeholder="Search medicine availability" data-testid="input-pharmacy-search" /></div><Badge tone="amber">Integration required</Badge></div>{term.length > 1 && <div className="mt-5 space-y-3">{search.data?.map((x: any) => <div className="flex justify-between rounded-xl border p-4" key={x.id}><span><b>{x.medicine}</b><small className="block">{x.pharmacy} · {x.distance}</small></span><button onClick={() => setChosen(x)} className="rounded-lg bg-[hsl(var(--secondary))] px-3 text-xs font-bold text-[hsl(var(--primary))]" data-testid={`button-order-${x.id}`}>Request order</button></div>) || <p className="text-sm text-[hsl(var(--muted-foreground))]">No connected availability results.</p>}</div>}</section><div className="mt-6 grid gap-6 lg:grid-cols-2"><section><h2 className="display mb-3 text-xl font-extrabold">Nearby pharmacies</h2><Async q={q} empty={!q.data?.length}><div className="space-y-3">{q.data?.map((p: any) => <div className="card p-5" key={p.id}><div className="flex justify-between"><ShoppingBag className="text-[hsl(var(--primary))]" /><Badge tone="slate">{p.integrationStatus || 'Integration required'}</Badge></div><h3 className="display mt-4 font-extrabold">{p.name}</h3><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{p.address} · {p.distance}</p></div>)}</div></Async></section><section><h2 className="display mb-3 text-xl font-extrabold">Order requests</h2><div className="card p-5">{orders.data?.map((x: any) => <div className="flex justify-between border-b p-3 text-sm last:border-0" key={x.id}><span><b>{x.medicine}</b><small className="block">{x.pharmacy}</small></span><Badge tone="amber">{x.status}</Badge></div>) || <p className="text-sm text-[hsl(var(--muted-foreground))]">No requests yet.</p>}</div></section></div>{chosen && <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget); order.mutate({ data: { medicine: chosen.medicine, pharmacy: chosen.pharmacy, quantity: Number(fd.get('quantity')), deliveryAddress: String(fd.get('address')), prescriptionInfo: null } }, { onSuccess: () => { setChosen(null); qc.invalidateQueries({ queryKey: getListMedicineOrdersQueryKey() }); } }); }} className="card mt-6 grid gap-4 p-6 sm:grid-cols-2"><h2 className="display text-xl font-extrabold sm:col-span-2">Request {chosen.medicine}</h2><input name="quantity" type="number" min="1" defaultValue="1" className="min-h-12 rounded-xl border px-3" data-testid="input-order-quantity" /><input name="address" required className="min-h-12 rounded-xl border px-3" placeholder="Delivery address" data-testid="input-order-address" /><button className="min-h-12 rounded-xl bg-[hsl(var(--primary))] font-bold text-white sm:col-span-2" data-testid="button-submit-order">Submit request</button></form>}</Shell>; }

function LiveEmergency() {
  const loc = usePatientLocation();
  const history = useListEmergencyHistory();
  const activate = useActivateEmergency();
  const cancel = useCancelEmergency();
  const qc = useQueryClient();
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const sos = async () => {
    if (!window.confirm('Start the demo SOS flow? No emergency service will be contacted.')) return;
    setError('');
    let currentLocation = loc.location;
    if (!currentLocation) currentLocation = await loc.refresh();
    activate.mutate({ data: currentLocation ? { latitude: currentLocation.latitude, longitude: currentLocation.longitude } : undefined }, {
      onSuccess: () => { setActive(true); qc.invalidateQueries({ queryKey: getListEmergencyHistoryQueryKey() }); },
      onError: (requestError) => setError(requestError instanceof Error ? requestError.message : 'Unable to start the SOS demo.'),
    });
  };
  return <Shell><Title eyebrow="Visible when you need it" title="Emergency help" detail="This demo records an SOS event but does not contact dispatch, SMS, WhatsApp, or a hospital." /><div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]"><section className="card border-[hsl(4_66%_49%/.25)] p-7"><Badge tone="red">Demo SOS</Badge><h2 className="display mt-3 text-2xl font-extrabold">Need urgent help?</h2><p className="mt-4 text-sm leading-6 text-[hsl(var(--muted-foreground))]">If you are in immediate danger, call your local emergency number first. Location is requested only when you start this flow or choose Refresh my location.</p><button onClick={sos} disabled={active || activate.isPending} className="mt-7 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[hsl(var(--destructive))] text-lg font-extrabold text-white disabled:opacity-50" data-testid="button-sos"><Siren />{active ? 'Demo alert is active' : activate.isPending ? 'Starting…' : 'Start SOS flow'}</button>{active && <button onClick={() => { const event: any = history.data?.[0]; if (event) cancel.mutate({ id: event.id }, { onSuccess: () => { setActive(false); qc.invalidateQueries({ queryKey: getListEmergencyHistoryQueryKey() }); } }); }} className="mt-3 min-h-12 w-full rounded-xl border font-bold" data-testid="button-cancel-sos">Cancel demo alert</button>}{error && <p role="alert" className="mt-4 text-sm text-[hsl(var(--destructive))]">{error}</p>}<div className="mt-6 rounded-xl bg-[hsl(var(--muted))] p-4 text-xs leading-5"><b>Demo only.</b> No message or dispatch request is sent.</div></section><div className="space-y-6"><LocationCard /><NearbyCare initialCategory="hospital" /></div></div><section className="card mt-6 p-6"><h2 className="display text-xl font-extrabold">Event history</h2>{history.data?.map((event: any) => <div className="mt-4 flex justify-between border-b pb-3 text-sm" key={event.id}><span><b>{event.status}</b><small className="block text-[hsl(var(--muted-foreground))]">{event.createdAt}{event.latitude != null && event.longitude != null ? ` · ${event.latitude}, ${event.longitude}` : ' · No location shared'}</small></span><Badge tone="amber">{event.notificationStatus || 'Demo'}</Badge></div>) || <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">No emergency events in this space.</p>}</section></Shell>;
}
function LiveHospitals() {
  const appointments = useListAppointments();
  const create = useCreateAppointment();
  const qc = useQueryClient();
  const [place, setPlace] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  return <Shell><Title eyebrow="Care nearby" title="Hospitals" detail="Real nearby places use your current browser location and OpenStreetMap results." /><NearbyCare initialCategory="hospital" onChoose={(selected) => { setPlace(selected); setForm({ placeId: selected.id }); }} />{place && <form onSubmit={(event) => { event.preventDefault(); create.mutate({ data: form }, { onSuccess: () => { setPlace(null); qc.invalidateQueries({ queryKey: getListAppointmentsQueryKey() }); } }); }} className="card mt-6 grid gap-4 p-6 sm:grid-cols-2"><h2 className="display text-xl font-extrabold sm:col-span-2">Request at {place.name}</h2>{['doctorOrDepartment', 'date', 'time', 'reason'].map((key) => <label className="text-sm font-bold" key={key}>{key.replace(/([A-Z])/g, ' $1')}<input required type={key === 'date' ? 'date' : key === 'time' ? 'time' : 'text'} className="mt-2 min-h-12 w-full rounded-xl border px-3" value={form[key] || ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}<button className="min-h-12 rounded-xl bg-[hsl(var(--primary))] font-bold text-white sm:col-span-2" data-testid="button-submit-appointment">Send request for review</button></form>}<section className="card mt-6 p-6"><h2 className="display text-lg font-extrabold">Your appointment requests</h2>{appointments.data?.map((item: any) => <div className="mt-3 flex justify-between rounded-xl bg-[hsl(var(--muted))] p-4 text-sm" key={item.id}><span><b>{item.hospitalName}</b><small className="block">{item.date} · {item.doctorOrDepartment}</small></span><Badge tone="amber">{item.status}</Badge></div>) || <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">No requests yet.</p>}</section></Shell>;
}
function LivePharmacies() {
  const orders = useListMedicineOrders();
  const createOrder = useCreateMedicineOrder();
  const qc = useQueryClient();
  const [place, setPlace] = useState<any>(null);
  const [medicine, setMedicine] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [address, setAddress] = useState('');
  return <Shell><Title eyebrow="Plan ahead" title="Pharmacies" detail="Nearby places are real OpenStreetMap results. Inventory, payment, and delivery are not connected." /><NearbyCare initialCategory="pharmacy" onChoose={(selected) => setPlace(selected)} /><section className="card mt-6 p-5"><h2 className="display text-xl font-extrabold">Order requests</h2>{orders.data?.length ? orders.data.map((item: any) => <div className="flex justify-between border-b p-3 text-sm last:border-0" key={item.id}><span><b>{item.medicine}</b><small className="block">{item.pharmacy}</small></span><Badge tone="amber">{item.status}</Badge></div>) : <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">No requests yet.</p>}</section>{place && <form onSubmit={(event) => { event.preventDefault(); createOrder.mutate({ data: { medicine, pharmacy: place.name, quantity, deliveryAddress: address, prescriptionInfo: null } }, { onSuccess: () => { setPlace(null); setMedicine(''); setQuantity(1); setAddress(''); qc.invalidateQueries({ queryKey: getListMedicineOrdersQueryKey() }); } }); }} className="card mt-6 grid gap-4 p-6 sm:grid-cols-2"><h2 className="display text-xl font-extrabold sm:col-span-2">Request from {place.name}</h2><label className="text-sm font-bold">Medicine<input required value={medicine} onChange={(event) => setMedicine(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border px-3" /></label><label className="text-sm font-bold">Quantity<input required min={1} type="number" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="mt-2 min-h-12 w-full rounded-xl border px-3" /></label><label className="text-sm font-bold sm:col-span-2">Delivery address<input required value={address} onChange={(event) => setAddress(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border px-3" /></label><p className="text-xs text-[hsl(var(--muted-foreground))] sm:col-span-2">This only creates a demo request. The pharmacy is not contacted and availability is not verified.</p><button className="min-h-12 rounded-xl bg-[hsl(var(--primary))] font-bold text-white sm:col-span-2" data-testid="button-submit-order">Submit request</button></form>}</Shell>;
}
function Reports() { const q = useGetAdherenceReport(); const [range, setRange] = useState('weekly'); const r: any = q.data; const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(r || {}, null, 2)], { type: 'application/json' })); a.download = 'adherence-report.json'; a.click(); }; return <Shell><Title eyebrow="A clearer picture over time" title="Adherence reports" detail="Bring this view to a conversation with your care team." action={<button onClick={download} className="flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold" data-testid="button-download-report"><Download size={16} /> Download</button>} /><Async q={q}><section className="card p-6 sm:p-8"><div className="flex justify-between"><div><h2 className="display text-2xl font-extrabold">Dose adherence</h2><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Percentage of scheduled doses marked taken.</p></div><select value={range} onChange={e => setRange(e.target.value)} className="min-h-10 rounded-lg border px-2 text-sm" data-testid="select-report-range"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div><div className="mt-10 flex h-64 items-end gap-2 border-b border-l px-3">{r?.[range]?.map((p: any, i: number) => <div className="flex h-full flex-1 flex-col items-center justify-end gap-2" key={i}><small className="text-[10px] text-[hsl(var(--primary))]">{Math.round(p.value)}%</small><div className="w-full max-w-12 rounded-t-lg bg-[hsl(var(--primary))]" style={{ height: `${Math.max(7, p.value)}%` }} /><small>{p.label}</small></div>) || <p className="m-auto text-sm text-[hsl(var(--muted-foreground))]">Report data will appear after doses are recorded.</p>}</div></section><section className="card mt-6 p-6"><h2 className="display text-xl font-extrabold">By medicine</h2>{r?.byMedicine?.map((p: any) => <div className="mt-4" key={p.label}><div className="flex justify-between text-sm"><b>{p.label}</b><span>{Math.round(p.value)}%</span></div><div className="mt-2 h-2 rounded-full bg-[hsl(var(--muted))]"><div className="h-full rounded-full bg-[hsl(var(--primary))]" style={{ width: `${p.value}%` }} /></div></div>)}</section></Async></Shell>; }

function Profile() { const q = useGetPatientProfile(); const update = useUpdatePatientProfile(); const qc = useQueryClient(); const [f, setF] = useState<any>({}); useEffect(() => { if (q.data) setF(q.data); }, [q.data]); const keys = ['fullName', 'age', 'email', 'phone', 'address', 'doctorName', 'clinic', 'doctorPhone', 'doctorEmail', 'department']; return <Shell><Title eyebrow="Your information" title="Profile" detail="Keep contact details current for better care conversations." /><Async q={q}><form onSubmit={e => { e.preventDefault(); update.mutate({ data: { ...f, age: Number(f.age) } }, { onSuccess: () => qc.invalidateQueries({ queryKey: getGetPatientProfileQueryKey() }) }); }} className="card grid gap-4 p-6 sm:grid-cols-2">{keys.map(k => <label className="text-sm font-bold" key={k}>{k.replace(/([A-Z])/g, ' $1')}<input className="mt-2 min-h-12 w-full rounded-xl border px-3" value={f[k] || ''} onChange={e => setF({ ...f, [k]: e.target.value })} data-testid={`input-profile-${k}`} /></label>)}<button className="min-h-12 rounded-xl bg-[hsl(var(--primary))] font-bold text-white sm:col-span-2" data-testid="button-save-profile">Save profile</button></form></Async></Shell>; }
function Settings() {
  const [voice, setVoice] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [voiceMessage, setVoiceMessage] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const testBusyRef = useRef(false);
  const [theme, setTheme] = useState('light');
  const medicines = useListMedicines();
  const { location, error: locationError, loading: locationLoading, refresh } = usePatientLocation();
  useEffect(() => { authFetch('/me').then((user) => { setUserId(user.id); setVoice(localStorage.getItem(`pcai-voice-enabled:${user.id}`) === 'true'); }).catch(() => setUserId(null)); }, []);
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]);
  const toggleVoice = async () => {
    const enabled = !voice;
    setVoice(enabled);
    setVoiceMessage('');
    if (!userId) return;
    localStorage.setItem(`pcai-voice-enabled:${userId}`, String(enabled));
    window.dispatchEvent(new Event('pcai-voice-change'));
    if (enabled) {
      speakReminder('Voice reminders are enabled. Use Test Voice to hear a sample reminder.', `voice-enabled:${userId}:${Date.now()}`, (feedback) => setVoiceMessage(feedback.message));
    }
    if (enabled && 'Notification' in window && Notification.permission === 'default') {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'denied') setVoiceMessage('Browser notifications are blocked. The in-app reminder will still appear while this app is open.');
      } catch {
        setVoiceMessage('Browser notification permission could not be requested. In-app reminders will still appear.');
      }
    }
  };
  const testVoice = () => {
    setVoiceMessage('');
    if (!supportsSpeechSynthesis()) { setVoiceMessage('Speech is unavailable in this browser. In-app reminders will still appear when the app is open.'); return; }
    if (medicines.isLoading) { setVoiceMessage('Loading your saved medication schedule. Please try Test Voice again in a moment.'); return; }
    if (testBusyRef.current) return;

    const medicine = medicines.data?.find((item: any) => item.active !== false);
    const message = medicine
      ? `Hello! This is a test reminder for your scheduled ${medicine.name} ${medicine.dosage} dose, scheduled at ${medicine.scheduledTime}. Please follow your prescribed medication schedule.`
      : 'Hello! Your voice reminder test is working. Please follow your prescribed medication schedule.';
    testBusyRef.current = true;
    setTestBusy(true);
    if (medicines.isError) setVoiceMessage('Could not load the saved schedule, so this will be a general voice test.');
    speakReminder(message, `voice-test:${userId ?? 'patient'}:${Date.now()}`, (feedback) => {
      if (feedback.kind === 'speaking') {
        setVoiceMessage(medicine
          ? `Speaking a test reminder for ${medicine.name}, ${medicine.dosage}, scheduled at ${medicine.scheduledTime}.`
          : 'The voice test is playing. Add a saved medicine to personalize reminder speech.');
      } else if (feedback.kind === 'done') {
        setVoiceMessage(medicine
          ? `Voice test finished for ${medicine.name}, ${medicine.dosage}, scheduled at ${medicine.scheduledTime}.`
          : 'Voice test finished. Add a saved medicine to personalize reminder speech.');
        testBusyRef.current = false;
        setTestBusy(false);
      } else {
        setVoiceMessage(feedback.message);
        if (feedback.kind === 'error') {
          testBusyRef.current = false;
          setTestBusy(false);
        }
      }
    });
  };
  return <Shell><Title eyebrow="Make it yours" title="Settings" detail="Reminder behavior, location permission, and display choices." /><div className="grid gap-6 lg:grid-cols-2"><section className="card p-6"><h2 className="display text-xl font-extrabold">Medication reminders</h2><Toggle title="Enable Voice Reminders" detail="Speak scheduled medication reminders while this app is open" value={voice} onClick={toggleVoice} test="toggle-voice" /><button onClick={testVoice} disabled={testBusy || medicines.isLoading} className="mt-4 flex min-h-12 items-center gap-2 rounded-xl bg-[hsl(var(--secondary))] px-4 text-sm font-bold text-[hsl(var(--primary))] disabled:cursor-wait disabled:opacity-60" data-testid="button-test-voice"><Volume2 size={16} />{testBusy ? 'Speaking…' : medicines.isLoading ? 'Loading schedule…' : 'Test Voice'}</button>{voiceMessage && <p role="status" className="mt-3 rounded-xl bg-[hsl(var(--muted))] p-3 text-sm">{voiceMessage}</p>}<p className="mt-4 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Turn on voice reminders, then tap Test Voice once to allow browser audio. Scheduled speech uses your saved medicine, dose, and local scheduled time. Keep this app open; browser speech cannot run when the app is closed or your device is asleep. Browser alerts may be delayed in a background tab.</p><button onClick={() => { if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission(); else setVoiceMessage('System notifications are unavailable or already configured in this browser.'); }} className="mt-3 text-sm font-bold text-[hsl(var(--primary))]" data-testid="button-enable-notifications">Enable browser notifications</button><p className="mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Notifications can work in a background tab after permission is granted. Reliable reminders while closed require a configured push-notification service and service worker.</p></section><section className="card p-6"><h2 className="display text-xl font-extrabold">Privacy & display</h2><div className="mt-5 flex items-center justify-between rounded-xl bg-[hsl(var(--muted))] p-4"><span><b className="block text-sm">Theme</b><small>Choose what is easiest to read</small></span><select value={theme} onChange={e => setTheme(e.target.value)} className="min-h-10 rounded-lg border px-2" data-testid="select-theme"><option value="light">Light</option><option value="dark">Dark</option></select></div><div className="mt-5 rounded-xl bg-[hsl(var(--muted))] p-4"><b className="block text-sm">Current location</b><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{location ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}` : 'Not shared'}</p><button disabled={locationLoading} onClick={() => void refresh()} className="mt-3 min-h-10 rounded-xl bg-[hsl(var(--card))] px-3 text-sm font-bold disabled:opacity-60" data-testid="button-refresh-location">{locationLoading ? 'Finding location…' : 'Refresh my location'}</button>{locationError && <p role="alert" className="mt-2 text-xs text-[hsl(var(--destructive))]">{locationError}</p>}</div></section></div><section className="card mt-6 flex gap-3 p-6"><ShieldCheck className="text-[hsl(var(--primary))]" /><div><h2 className="display font-extrabold">Integration status</h2><p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">SMS, WhatsApp, dispatch, hospital confirmation, pharmacy inventory, delivery, and medical records are not connected.</p><Badge tone="amber">Integration required</Badge></div></section></Shell>;
}
function Toggle({ title, detail, value, onClick, test }: { title: string; detail: string; value: boolean; onClick: () => void; test: string }) { return <div className="mt-5 flex items-center justify-between gap-4 rounded-xl bg-[hsl(var(--muted))] p-4"><span><b className="block text-sm">{title}</b><small>{detail}</small></span><button onClick={onClick} className={`relative h-7 w-12 rounded-full ${value ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--border))]'}`} data-testid={test}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white ${value ? 'translate-x-6' : 'translate-x-1'}`} /></button></div>; }
function CaregiverShell({ children }: { children: ReactNode }) {
  const logout = async () => { await authFetch('/logout', { method: 'POST' }).catch(() => undefined); window.location.href = '/'; };
  return <div className="shell-bg min-h-[100dvh]"><main className="mx-auto max-w-6xl px-4 py-6 sm:px-8"><header className="mb-5 flex flex-wrap items-center justify-between gap-4"><Logo /><div className="flex items-center gap-3"><Badge>Caregiver space</Badge><button onClick={logout} className="min-h-11 rounded-xl border px-4 text-sm font-bold" data-testid="button-caregiver-logout">Log out</button></div></header><nav aria-label="Caregiver navigation" className="mb-8 flex flex-wrap gap-2 border-b border-[hsl(var(--border))] pb-4"><a href="/caregiver-dashboard" className="min-h-10 rounded-xl bg-[hsl(var(--secondary))] px-4 py-2 text-sm font-bold text-[hsl(var(--primary))]">Overview</a><a href="#invitations" className="min-h-10 rounded-xl px-4 py-2 text-sm font-bold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]">Invitations</a><a href="#patients" className="min-h-10 rounded-xl px-4 py-2 text-sm font-bold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]">Connected patients</a><a href="#alerts" className="min-h-10 rounded-xl px-4 py-2 text-sm font-bold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]">Emergency alerts</a></nav>{children}</main></div>;
}
function CaregiverDashboard() {
  const [invitations, setInvitations] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [summaries, setSummaries] = useState<Record<number, any>>({});
  const [alerts, setAlerts] = useState<any[]>([]);
  const [error, setError] = useState('');
  const load = async () => {
    try {
      const [nextInvitations, connectedPatients, emergencyAlerts] = await Promise.all([apiFetch('/caregiver/invitations'), apiFetch('/caregiver/patients'), apiFetch('/caregiver/emergency-alerts')]);
      setInvitations(nextInvitations);
      setPatients(connectedPatients);
      setAlerts(emergencyAlerts);
      const entries = await Promise.all(connectedPatients.map(async (patient: any) => [patient.id, await apiFetch(`/caregiver/patients/${patient.id}/summary`)] as const));
      setSummaries(Object.fromEntries(entries));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load caregiver data.');
    }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const anchors = [
      { id: 'invitations', match: (text: string) => text.includes('Caregiver invitations') },
      { id: 'patients', match: (text: string) => text.includes('Connected patients') || text.includes('No patients are currently connected') },
      { id: 'alerts', match: (text: string) => text.includes('Emergency alerts') },
    ];
    const headings = Array.from(document.querySelectorAll('h2'));
    for (const anchor of anchors) {
      const heading = headings.find((item) => anchor.match(item.textContent || ''));
      const target = heading?.closest('section') || heading?.closest('.card');
      if (target) target.id = anchor.id;
    }
  }, [invitations.length, patients.length, alerts.length]);
  const decide = async (id: number, decision: 'accept' | 'reject') => { await apiFetch(`/caregiver/invitations/${id}/${decision}`, { method: 'POST' }); await load(); };
  return <CaregiverShell><Title eyebrow="Authorized connections only" title="Caregiver dashboard" detail="You only see patients who invited you and whose invitation you accepted." />{error && <p role="alert" className="mb-5 rounded-xl bg-[hsl(4_66%_49%/.1)] p-4 text-sm font-semibold text-[hsl(var(--destructive))]">{error}</p>}{invitations.length > 0 && <section className="card mb-6 p-6"><h2 className="display text-xl font-extrabold">Caregiver invitations</h2><div className="mt-4 space-y-3">{invitations.map((invitation: any) => <div className="rounded-xl border p-4" key={invitation.id}><p className="text-sm leading-6">Patient <b>{invitation.patientName}</b> has invited you to become their caregiver.</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{invitation.relationship} · invited {invitation.invitedAt}</p><div className="mt-4 flex gap-3"><button onClick={() => decide(invitation.id, 'accept')} className="min-h-11 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-white" data-testid={`button-accept-invitation-${invitation.id}`}>Accept</button><button onClick={() => decide(invitation.id, 'reject')} className="min-h-11 rounded-xl border px-4 text-sm font-bold" data-testid={`button-reject-invitation-${invitation.id}`}>Reject</button></div></div>)}</div></section>}{!patients.length && !invitations.length && <section className="card p-10 text-center"><Users className="mx-auto mb-3 text-[hsl(var(--primary))]" /><h2 className="display text-xl font-extrabold">No patients are currently connected to your caregiver account.</h2><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">A patient must invite you and you must accept the invitation before any care information is visible.</p></section>}{patients.length > 0 && <section><h2 className="display mb-4 text-xl font-extrabold">Connected patients</h2><div className="grid gap-4 lg:grid-cols-2">{patients.map((patient: any) => { const summary = summaries[patient.id]; return <article className="card p-6" key={patient.id}><div className="flex items-start justify-between"><div><Badge>Accepted connection</Badge><h3 className="display mt-3 text-2xl font-extrabold">{patient.name}</h3><p className="text-sm text-[hsl(var(--muted-foreground))]">{patient.relationship}</p></div><HeartPulse className="text-[hsl(var(--primary))]" /></div>{summary && <><div className="mt-6 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-[hsl(var(--muted))] p-3"><b className="block text-xl">{summary.stats.takenDoses}</b><small>Taken</small></div><div className="rounded-xl bg-[hsl(var(--muted))] p-3"><b className="block text-xl">{summary.stats.missedDoses}</b><small>Missed</small></div><div className="rounded-xl bg-[hsl(var(--muted))] p-3"><b className="block text-xl">{summary.stats.adherence}%</b><small>Adherence</small></div></div><h4 className="mt-6 text-sm font-extrabold">Today’s medication</h4><div className="mt-3 space-y-2">{summary.todayDoses.map((dose: any) => <div className="flex items-center justify-between rounded-xl border p-3 text-sm" key={dose.id}><span><b>{dose.medicineName}</b><small className="ml-2 text-[hsl(var(--muted-foreground))]">{dose.scheduledTime}</small></span><Badge tone={dose.status === 'taken' ? 'teal' : dose.status === 'missed' ? 'red' : 'amber'}>{dose.status}</Badge></div>)}</div><p className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">Risk: {summary.risk.riskLevel} · {summary.risk.explanation}</p></>}</article>; })}</div></section>}{alerts.length > 0 && <section className="card mt-6 border border-[hsl(4_66%_49%/.3)] p-6"><div className="flex items-center gap-3"><Siren className="text-[hsl(var(--destructive))]" /><h2 className="display text-xl font-extrabold">Emergency alerts</h2></div><div className="mt-4 space-y-3">{alerts.map((alert: any) => <div className="rounded-xl bg-[hsl(4_66%_49%/.07)] p-4" key={alert.id}><b>Emergency SOS · {alert.patientName}</b><p className="mt-1 text-sm">Time: {alert.createdAt}</p><p className="text-sm">Location: {alert.latitude}, {alert.longitude}</p><a className="mt-3 inline-block text-sm font-bold text-[hsl(var(--primary))]" href={`https://maps.google.com/?q=${alert.latitude},${alert.longitude}`} target="_blank" rel="noreferrer">View location</a></div>)}</div></section>}</CaregiverShell>;
}

function LocationCard() {
  const { location, loading, error, refresh } = usePatientLocation();
  const lat = location?.latitude;
  const lon = location?.longitude;
  const pad = 0.015;
  const mapSrc = lat !== undefined && lon !== undefined ? `https://www.openstreetmap.org/export/embed.html?bbox=${lon - pad}%2C${lat - pad}%2C${lon + pad}%2C${lat + pad}&layer=mapnik&marker=${lat}%2C${lon}` : '';
  return <section className="card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="display text-lg font-extrabold">Your current location</h2><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{location ? `${lat?.toFixed(5)}, ${lon?.toFixed(5)}` : 'Location has not been shared'}</p></div><button onClick={() => void refresh()} disabled={loading} className="min-h-11 rounded-xl bg-[hsl(var(--secondary))] px-4 text-sm font-bold text-[hsl(var(--primary))] disabled:opacity-50" data-testid="button-refresh-location"><LocateFixed size={16} />{loading ? 'Finding location…' : 'Refresh my location'}</button></div>{location && mapSrc && <iframe title="Map showing your current location" className="mt-4 h-64 w-full rounded-xl border-0" src={mapSrc} loading="lazy" referrerPolicy="no-referrer" />}{location?.accuracy !== undefined && <p className={`mt-3 text-xs ${location.accuracy > 1000 ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]'}`}>{location.accuracy > 1000 ? `Location may be imprecise (accuracy ±${Math.round(location.accuracy)} m). Refresh outdoors for a better fix.` : `Location accuracy approximately ±${Math.round(location.accuracy)} m.`}</p>}{error && <p role="alert" className="mt-3 text-sm text-[hsl(var(--destructive))]">{error}</p>}{!location && !error && <p className="mt-3 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Your browser will ask permission only after you choose Refresh my location. We do not track you continuously.</p>}</section>;
}
function NearbyCare({ initialCategory, onChoose }: { initialCategory: 'hospital' | 'pharmacy'; onChoose?: (place: any) => void }) {
  const { location, refresh, loading: locating, error: locationError } = usePatientLocation();
  const [category, setCategory] = useState(initialCategory);
  const [sortBy, setSortBy] = useState<'distance' | 'name'>('distance');
  const [places, setPlaces] = useState<any[]>([]);
  const [offset, setOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const query = async (nextOffset = 0, append = false) => {
    if (!location) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude), category, offset: String(nextOffset) });
      const result = await apiFetch(`/nearby/search?${params}`);
      setPlaces((current) => append ? [...current, ...result.results] : result.results);
      setOffset(result.nextOffset);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Nearby search failed. Please retry.');
      if (!append) setPlaces([]);
    } finally { setLoading(false); }
  };
  useEffect(() => { setPlaces([]); setOffset(null); if (location) void query(0, false); }, [location?.latitude, location?.longitude, category]);
  const sortedPlaces = [...places].sort((a, b) => sortBy === 'distance' ? a.distanceKm - b.distanceKm : a.name.localeCompare(b.name));
  return <section className="card p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="display text-xl font-extrabold">Nearby care</h2><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Real places from OpenStreetMap · distances are estimates</p></div>
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="nearby-category">Filter nearby places</label>
        <select id="nearby-category" value={category} onChange={(event) => setCategory(event.target.value as 'hospital' | 'pharmacy')} className="min-h-11 rounded-xl border px-3 text-sm font-bold" data-testid="select-nearby-category"><option value="hospital">Hospitals</option><option value="pharmacy">Pharmacies</option></select>
        <label className="sr-only" htmlFor="nearby-sort">Sort nearby places</label>
        <select id="nearby-sort" value={sortBy} onChange={(event) => setSortBy(event.target.value as 'distance' | 'name')} className="min-h-11 rounded-xl border px-3 text-sm font-bold" data-testid="select-nearby-sort"><option value="distance">Nearest first</option><option value="name">Name A–Z</option></select>
      </div>
    </div>
    <div className="mt-4"><LocationCard /></div>
    {!location && <div className="mt-4 rounded-xl bg-[hsl(var(--muted))] p-4"><p className="text-sm">Share your current location to search for nearby {category === 'hospital' ? 'hospitals' : 'pharmacies'}.</p><button onClick={() => void refresh()} disabled={locating} className="mt-3 min-h-11 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-white disabled:opacity-50">{locating ? 'Finding location…' : 'Find my location'}</button>{locationError && <p role="alert" className="mt-2 text-sm text-[hsl(var(--destructive))]">{locationError}</p>}</div>}
    {loading && <p className="mt-5 animate-pulse text-sm font-semibold text-[hsl(var(--muted-foreground))]" role="status">Searching OpenStreetMap…</p>}
    {error && <div role="alert" className="mt-4 rounded-xl bg-[hsl(4_66%_49%/.1)] p-4 text-sm text-[hsl(var(--destructive))]">{error}<button onClick={() => void query()} className="ml-3 font-bold underline">Retry</button></div>}
    {sortedPlaces.length > 0 && <div className="mt-5 space-y-3">{sortedPlaces.map((place: any) => <article key={place.id} className="rounded-xl border border-[hsl(var(--border))] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="display font-extrabold">{place.name}</h3><p className="mt-1 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{place.address}</p></div><Badge>{place.distance}</Badge></div><div className="mt-3 flex flex-wrap items-center gap-3 text-xs"><Badge tone="slate">{place.provider}</Badge><a href={place.directionsUrl} target="_blank" rel="noreferrer" className="font-bold text-[hsl(var(--primary))]">Directions</a>{onChoose && <button onClick={() => onChoose(place)} className="min-h-9 rounded-lg bg-[hsl(var(--secondary))] px-3 font-bold text-[hsl(var(--primary))]">{category === 'hospital' ? 'Request appointment' : 'Request medicine order'}</button>}</div></article>)}</div>}
    {places.length === 0 && !loading && !error && location && <p className="mt-5 text-sm text-[hsl(var(--muted-foreground))]">No matching places were returned near your current location. Try refreshing location or search again later.</p>}
    {offset !== null && <button onClick={() => void query(offset, true)} disabled={loading} className="mt-4 min-h-11 w-full rounded-xl border font-bold disabled:opacity-50">{loading ? 'Loading…' : 'Load more places'}</button>}
    <p className="mt-4 text-[10px] leading-4 text-[hsl(var(--muted-foreground))]">Place information © OpenStreetMap contributors (ODbL). Results depend on OpenStreetMap coverage. Distances are straight-line estimates.</p>
  </section>;
}
function Reminders() { const q = useListDoseStatus(); const update = useUpdateDoseStatus(); const qc = useQueryClient(); const doses = [...(q.data || [])].filter((dose: any) => dose.date === new Date().toISOString().slice(0, 10)).sort((a: any, b: any) => a.scheduledTime.localeCompare(b.scheduledTime)); return <Shell><Title eyebrow="A steady rhythm" title="Today's medication" detail="Mark each dose as taken or missed so your care plan stays current." /><Async q={q} empty={!doses.length}><div className="space-y-4">{doses.map((dose: any) => <section className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center" key={dose.id}><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Pill /></div><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[.14em] text-[hsl(var(--primary))]">{dose.scheduledTime}</p><h2 className="display mt-1 text-xl font-extrabold">{dose.medicineName}</h2><p className="text-sm text-[hsl(var(--muted-foreground))]">{dose.dosage} · {dose.instructions}</p></div><div className="flex gap-2"><button disabled={dose.status === 'taken'} onClick={() => update.mutate({ data: { doseId: dose.id, status: 'taken' } }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListDoseStatusQueryKey() }) })} className="min-h-11 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-white disabled:opacity-50" data-testid={`button-reminder-taken-${dose.id}`}>Taken</button><button disabled={dose.status === 'missed'} onClick={() => update.mutate({ data: { doseId: dose.id, status: 'missed' } }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListDoseStatusQueryKey() }) })} className="min-h-11 rounded-xl border px-4 text-sm font-bold disabled:opacity-50" data-testid={`button-reminder-missed-${dose.id}`}>Missed</button></div><Badge tone={dose.status === 'taken' ? 'teal' : dose.status === 'missed' ? 'red' : 'amber'}>{dose.status}</Badge></section>)}</div></Async></Shell>; }
function Appointments() { const q = useListAppointments(); return <Shell><Title eyebrow="Care planning" title="My appointments" detail="Review appointment requests and their current status." /><Async q={q} empty={!q.data?.length}><div className="space-y-3">{q.data?.map((appointment: any) => <section className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between" key={appointment.id}><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[hsl(var(--primary))]">{appointment.date} · {appointment.time}</p><h2 className="display mt-1 text-lg font-extrabold">{appointment.hospitalName}</h2><p className="text-sm text-[hsl(var(--muted-foreground))]">{appointment.doctorOrDepartment} · {appointment.reason}</p></div><Badge tone="amber">{appointment.status}</Badge></section>)}</div></Async></Shell>; }
function Orders() { const q = useListMedicineOrders(); return <Shell><Title eyebrow="Medication support" title="Medicine orders" detail="Track medicine order requests. Delivery and pharmacy inventory require a connected provider." /><Async q={q} empty={!q.data?.length}><div className="space-y-3">{q.data?.map((order: any) => <section className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between" key={order.id}><div><h2 className="display text-lg font-extrabold">{order.medicine}</h2><p className="text-sm text-[hsl(var(--muted-foreground))]">{order.pharmacy} · Quantity {order.quantity}</p><small className="text-[hsl(var(--muted-foreground))]">{order.createdAt}</small></div><Badge tone="amber">{order.status}</Badge></section>)}</div></Async></Shell>; }
function Protected({ children, role = 'patient' }: { children: ReactNode; role?: 'patient' | 'caregiver' }) { const [, go] = useLocation(); const [state, setState] = useState<'checking' | 'ready' | 'login'>('checking'); const [user, setUser] = useState<AuthUser | null>(null); useEffect(() => { authFetch('/me').then((result) => { setUser(result); setState('ready'); }).catch(() => { setState('login'); }); }, []); useEffect(() => { if (state === 'login') go(role === 'caregiver' ? '/caregiver-login' : '/login'); else if (state === 'ready' && user && user.role !== role) go(user.role === 'caregiver' ? '/caregiver-dashboard' : '/dashboard'); }, [go, role, state, user]); if (state === 'checking') return <div className="grid min-h-[100dvh] place-items-center bg-[hsl(var(--background))]"><p className="text-sm font-bold text-[hsl(var(--muted-foreground))]">Checking your secure session…</p></div>; if (!user || user.role !== role) return null; return <>{children}</>; }

function Router() { const protectedRoute = (component: ReactNode) => <Protected>{component}</Protected>; const caregiverRoute = (component: ReactNode) => <Protected role="caregiver">{component}</Protected>; return <ErrorBoundary resetKey={window.location.pathname}><Switch><Route path="/" component={Landing} /><Route path="/login"><Auth /></Route><Route path="/register"><Auth register /></Route><Route path="/caregiver-login"><Auth caregiver /></Route><Route path="/caregiver-register"><Auth caregiver register /></Route><Route path="/dashboard">{protectedRoute(<Dashboard />)}</Route><Route path="/medicines">{protectedRoute(<Medicines />)}</Route><Route path="/reminders">{protectedRoute(<Reminders />)}</Route><Route path="/history">{protectedRoute(<History />)}</Route><Route path="/assistant">{protectedRoute(<Assistant />)}</Route><Route path="/chat">{protectedRoute(<Assistant />)}</Route><Route path="/risk">{protectedRoute(<Risk />)}</Route><Route path="/caregiver">{protectedRoute(<Caregiver />)}</Route><Route path="/emergency">{protectedRoute(<LiveEmergency />)}</Route><Route path="/hospitals">{protectedRoute(<LiveHospitals />)}</Route><Route path="/pharmacies">{protectedRoute(<LivePharmacies />)}</Route><Route path="/appointments">{protectedRoute(<Appointments />)}</Route><Route path="/orders">{protectedRoute(<Orders />)}</Route><Route path="/reports">{protectedRoute(<Reports />)}</Route><Route path="/profile">{protectedRoute(<Profile />)}</Route><Route path="/settings">{protectedRoute(<Settings />)}</Route><Route path="/caregiver-dashboard">{caregiverRoute(<CaregiverDashboard />)}</Route><Route component={NotFound} /></Switch></ErrorBoundary>; }
export default function App() { return <QueryClientProvider client={client}><TooltipProvider><PatientLocationProvider><MedicationReminderService /><Router /><Toaster /></PatientLocationProvider></TooltipProvider></QueryClientProvider>; }