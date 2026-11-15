import emailjs from 'emailjs-com';

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || '';
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || '';
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || '';

export const isEmailJsConfigured = () => {
  return Boolean(SERVICE_ID && TEMPLATE_ID && PUBLIC_KEY);
};

export const sendEmergencyEmailAlert = async ({
  seniorName = 'Senior User',
  emergencyType = 'SOS Button Pressed',
  location = 'Home Residence (Living Room Console)',
  recipientEmail = 'caretaker@family.care',
  customNote = '',
}) => {
  const timestamp = new Date().toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'medium',
  });

  const templateParams = {
    to_email: recipientEmail,
    senior_name: seniorName,
    alert_type: emergencyType,
    incident_time: timestamp,
    incident_location: location,
    notes: customNote || 'Immediate attention recommended. Please verify status via dashboard or telephone.',
  };

  if (!isEmailJsConfigured()) {
    console.info(
      'EmailJS is not fully configured with environment variables. Simulating emergency email alert dispatch:',
      templateParams
    );
    return {
      status: 200,
      text: 'Simulated alert dispatch success (Environment keys pending)',
      simulated: true,
    };
  }

  try {
    const result = await emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, PUBLIC_KEY);
    return {
      status: result.status,
      text: result.text,
      simulated: false,
    };
  } catch (error) {
    console.error('Failed to dispatch emergency email via EmailJS:', error);
    throw error;
  }
};

export const sendDailyReportEmail = async ({
  seniorName = 'Senior User',
  recipientEmail,
  medicationsSummary,
  vitalNotes,
}) => {
  const templateParams = {
    to_email: recipientEmail,
    senior_name: seniorName,
    report_date: new Date().toLocaleDateString('en-US'),
    medications_summary: medicationsSummary,
    vital_notes: vitalNotes,
  };

  if (!isEmailJsConfigured()) {
    console.info('Simulating daily report email dispatch:', templateParams);
    return { status: 200, simulated: true };
  }

  return await emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, PUBLIC_KEY);
};

