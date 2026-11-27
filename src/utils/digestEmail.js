/**
 * Format a digest object into a Resend email subject and <=10-line plain-text body.
 * Never includes chat content, diagnoses, or health advice.
 */
export function formatDigestEmail(digest) {
  const seniorName = digest?.senior_name || 'Senior';
  const date = digest?.date || '';
  const subject = `Daily update: ${seniorName}, ${date}`;

  const flags = Array.isArray(digest?.flags) ? digest.flags : [];
  const meds = digest?.meds || { scheduled_count: 0, taken_count: 0, missed: [], adherence_pct: null };
  const stock = Array.isArray(digest?.stock) ? digest.stock : [];
  const sos = Array.isArray(digest?.sos) ? digest.sos : [];
  const activity = digest?.activity || null;

  const hasAlerts =
    flags.length > 0 ||
    (Array.isArray(meds.missed) && meds.missed.length > 0) ||
    stock.length > 0 ||
    sos.length > 0;

  if (!hasAlerts) {
    const lines = ['All doses taken. No alerts.'];
    if (meds.adherence_pct !== null && meds.adherence_pct !== undefined) {
      lines.push(`Adherence: ${meds.taken_count}/${meds.scheduled_count} (${meds.adherence_pct}%)`);
    }
    if (activity) {
      lines.push(
        `Activity: ${activity.interactions_count} interactions (${activity.first_active_time}-${activity.last_active_time})`
      );
    }
    return { subject, text: lines.slice(0, 10).join('\n') };
  }

  const lines = [];

  if (flags.length > 0) {
    lines.push(`Flags: ${flags.join('; ')}`);
  }

  if (meds.adherence_pct !== null && meds.adherence_pct !== undefined) {
    lines.push(`Adherence: ${meds.taken_count}/${meds.scheduled_count} (${meds.adherence_pct}%)`);
  }

  if (Array.isArray(meds.missed) && meds.missed.length > 0) {
    const missedStr = meds.missed.map((m) => `${m.name} (${m.time})`).join(', ');
    lines.push(`Missed: ${missedStr}`);
  }

  if (stock.length > 0) {
    const stockStr = stock
      .map((s) => `${s.name} (${s.status}${s.days_left !== null ? `, ${s.days_left}d` : ''})`)
      .join(', ');
    lines.push(`Stock: ${stockStr}`);
  }

  if (sos.length > 0) {
    const sosStr = sos
      .map((s) => `${s.time} (${s.resolved ? 'resolved' : 'unresolved'})`)
      .join(', ');
    lines.push(`SOS: ${sosStr}`);
  }

  if (activity) {
    lines.push(
      `Activity: ${activity.interactions_count} interactions (${activity.first_active_time}-${activity.last_active_time})`
    );
  }

  return {
    subject,
    text: lines.slice(0, 10).join('\n'),
  };
}
