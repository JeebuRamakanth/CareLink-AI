import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Container } from '../../components/ui/Container';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { cn } from '../../components/common/cn';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  IconDoctor,
  IconHeart,
  IconHospital,
  IconSend,
  IconShield,
  IconSparkle,
} from '../../components/agent/AgentIcons';

const CATEGORIES = [
  { value: 'general', label: 'General enquiry', icon: IconSparkle, blurb: 'Questions about CareLink.AI and how it works.' },
  { value: 'support', label: 'Product support', icon: IconHeart, blurb: 'Something isn’t working as expected — we’ll help.' },
  { value: 'partnership', label: 'Partnership enquiry', icon: IconShield, blurb: 'Explore working with the CareLink.AI platform.' },
  { value: 'provider', label: 'Hospital / provider enquiry', icon: IconHospital, blurb: 'Hospitals, clinics, and clinicians joining the network.' },
  { value: 'feedback', label: 'Feedback', icon: IconDoctor, blurb: 'Ideas and suggestions to make CareLink.AI better.' },
] as const;

type CategoryValue = (typeof CATEGORIES)[number]['value'];

interface FormState {
  name: string;
  email: string;
  category: CategoryValue | '';
  subject: string;
  message: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;
type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (form.name.trim().length < 2) errors.name = 'Please enter your name (at least 2 characters).';
  if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = 'Please enter a valid email address.';
  if (!form.category) errors.category = 'Please choose a topic.';
  if (form.subject.trim().length < 4) errors.subject = 'Please add a short subject (at least 4 characters).';
  if (form.message.trim().length < 20) errors.message = 'Please tell us a little more (at least 20 characters).';
  return errors;
}

// Demo transport: no messaging backend is configured in this build, so
// submissions are simulated locally and nothing leaves the device.
function submitDemoMessage(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 900);
  });
}

export function ContactPage() {
  useDocumentTitle(
    'Contact — CareLink.AI',
    'Get in touch with CareLink.AI: general enquiries, product support, partnerships, hospital and provider enquiries, or feedback.'
  );

  const [form, setForm] = useState<FormState>({ name: '', email: '', category: '', subject: '', message: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [reference, setReference] = useState('');

  const selectedCategory = useMemo(
    () => CATEGORIES.find((c) => c.value === form.category),
    [form.category]
  );

  const update = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setStatus('submitting');
    try {
      await submitDemoMessage();
      setReference(`CL-${Date.now().toString(36).toUpperCase().slice(-6)}`);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  const resetForm = () => {
    setForm({ name: '', email: '', category: '', subject: '', message: '' });
    setErrors({});
    setStatus('idle');
    setReference('');
  };

  return (
    <Container className="py-10 sm:py-14">
      <div className="space-y-10">
        <section className="max-w-2xl space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-200">Contact</p>
          <h1 className="text-balance text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">
            We&apos;d love to hear from you
          </h1>
          <p className="text-sm leading-7 text-ink-300 sm:text-base sm:leading-8">
            Questions about the product, support with your account, partnership conversations, or feedback to
            make CareLink.AI better — choose a topic and send us a message.
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10">
          {/* Topic picker */}
          <section aria-label="Choose a topic" className="space-y-3">
            {CATEGORIES.map((category) => (
              <button
                key={category.value}
                type="button"
                onClick={() => update('category', category.value)}
                aria-pressed={form.category === category.value}
                className={cn(
                  'flex w-full items-start gap-4 rounded-[var(--radius-2xl)] border px-5 py-4 text-left transition-all duration-200',
                  form.category === category.value
                    ? 'border-brand-400/50 bg-brand-500/15'
                    : 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10'
                )}
              >
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                    form.category === category.value
                      ? 'border-brand-400/40 bg-brand-500/20 text-brand-100'
                      : 'border-white/10 bg-white/5 text-ink-300'
                  )}
                >
                  <category.icon width={18} height={18} aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{category.label}</p>
                  <p className="mt-1 text-sm leading-6 text-ink-300">{category.blurb}</p>
                </div>
              </button>
            ))}
            {errors.category ? <p className="text-xs text-rose-300">{errors.category}</p> : null}

            <div className="rounded-[var(--radius-2xl)] border border-amber-400/25 bg-amber-500/10 px-5 py-4">
              <p className="text-xs leading-6 text-amber-100">
                <span className="font-semibold">Demo mode:</span> this build has no messaging backend connected.
                Submissions are simulated in your browser — no email is sent and no data leaves your device.
              </p>
            </div>
          </section>

          {/* Form / states */}
          <Card padding="lg">
            {status === 'success' ? (
              <div className="space-y-5 text-center" role="status">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/15 text-emerald-200">
                  <IconSend width={22} height={22} aria-hidden />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold text-white">Message recorded — demo only</h2>
                  <p className="mx-auto max-w-md text-sm leading-7 text-ink-300">
                    Thanks{form.name ? `, ${form.name.trim()}` : ''}. Your message was simulated locally in this
                    demo build. <span className="font-semibold text-white">No email has been sent</span> — there is
                    no messaging backend connected yet.
                  </p>
                </div>
                <p className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium tracking-[0.18em] text-ink-300 uppercase">
                  Reference {reference}
                </p>
                <div className="pt-2">
                  <Button variant="secondary" onClick={resetForm}>Send another message</Button>
                </div>
              </div>
            ) : (
              <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-white">
                    {selectedCategory ? selectedCategory.label : 'Send a message'}
                  </h2>
                  <p className="text-sm text-ink-400">
                    {selectedCategory
                      ? selectedCategory.blurb
                      : 'Pick a topic on the left, or just fill in the form below.'}
                  </p>
                </div>

                {status === 'error' ? (
                  <div role="alert" className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3">
                    <p className="text-sm text-rose-100">
                      Something went wrong while recording your message. Nothing was submitted — please try again.
                    </p>
                  </div>
                ) : null}

                <div className="grid gap-5 sm:grid-cols-2">
                  <Input
                    label="Name"
                    name="name"
                    autoComplete="name"
                    placeholder="Your full name"
                    value={form.name}
                    onChange={(event) => update('name', event.target.value)}
                    error={errors.name}
                    maxLength={80}
                    required
                  />
                  <Input
                    label="Email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={(event) => update('email', event.target.value)}
                    error={errors.email}
                    maxLength={120}
                    required
                  />
                </div>

                <label className="flex w-full flex-col gap-2 text-sm text-ink-200">
                  <span className="text-sm font-medium text-ink-100">Category</span>
                  <select
                    name="category"
                    value={form.category}
                    onChange={(event) => update('category', event.target.value)}
                    required
                    className={cn(
                      'w-full rounded-[var(--radius-lg)] border border-white/10 bg-slate-950/50 px-4 py-3 text-white shadow-inner outline-none transition-all duration-200 focus:border-brand-400/70 focus:ring-2 focus:ring-brand-400/25',
                      errors.category && 'border-rose-400/60 focus:border-rose-400/80 focus:ring-rose-400/20'
                    )}
                  >
                    <option value="" disabled>Select a topic…</option>
                    {CATEGORIES.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                  {errors.category ? <span className="text-xs text-rose-300">{errors.category}</span> : null}
                </label>

                <Input
                  label="Subject"
                  name="subject"
                  placeholder="What is this about?"
                  value={form.subject}
                  onChange={(event) => update('subject', event.target.value)}
                  error={errors.subject}
                  maxLength={120}
                  required
                />

                <label className="flex w-full flex-col gap-2 text-sm text-ink-200">
                  <span className="text-sm font-medium text-ink-100">Message</span>
                  <textarea
                    name="message"
                    rows={5}
                    placeholder="Tell us how we can help…"
                    value={form.message}
                    onChange={(event) => update('message', event.target.value)}
                    maxLength={2000}
                    required
                    className={cn(
                      'w-full resize-y rounded-[var(--radius-lg)] border border-white/10 bg-slate-950/50 px-4 py-3 text-white shadow-inner outline-none transition-all duration-200 placeholder:text-ink-400 focus:border-brand-400/70 focus:ring-2 focus:ring-brand-400/25',
                      errors.message && 'border-rose-400/60 focus:border-rose-400/80 focus:ring-rose-400/20'
                    )}
                  />
                  {errors.message ? <span className="text-xs text-rose-300">{errors.message}</span> : null}
                </label>

                <Button type="submit" size="lg" fullWidth loading={status === 'submitting'}>
                  {status === 'submitting' ? 'Sending…' : 'Send message'}
                </Button>
                <p className="text-center text-xs leading-5 text-ink-500">
                  Demo build — your message stays in this browser and is never transmitted.
                </p>
              </form>
            )}
          </Card>
        </div>
      </div>
    </Container>
  );
}
