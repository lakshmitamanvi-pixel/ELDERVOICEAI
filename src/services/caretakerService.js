import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from './firebase.js';
import { normalizeMedicine, validateMedicine } from '../utils/medicinePrediction.js';

const INITIAL_PROFILE = {
  fullName: 'Eleanor Vance',
  preferredName: 'Ellie',
  age: 78,
  primaryLanguage: 'en-US',
  bloodType: 'O+',
  allergies: 'Penicillin, Shellfish',
  medicalNotes: {
    primaryPhysician: 'Dr. Robert Chen, MD',
    physicianPhone: '(555) 234-8900',
    conditions: 'Hypertension, Mild Cognitive Impairment (Early Stage)',
    dietaryRestrictions: 'Low sodium, heart-healthy',
  },
  emergencyContacts: [
    {
      id: 'ec-1',
      name: 'Sarah Vance',
      relationship: 'Daughter (Primary Carer)',
      phone: '(555) 912-3456',
      isPrimary: true,
    },
    {
      id: 'ec-2',
      name: 'Michael Vance',
      relationship: 'Son',
      phone: '(555) 876-5432',
      isPrimary: false,
    },
  ],
  memoryVault: {
    familyMembers: [
      { id: 'fm-1', name: 'Sarah', relationship: 'Daughter', note: 'Visits every Sunday afternoon with grandson Leo.' },
      { id: 'fm-2', name: 'Michael', relationship: 'Son', note: 'Lives in Seattle, calls on Wednesday evenings.' },
      { id: 'fm-3', name: 'Arthur Vance', relationship: 'Late Husband', note: 'Married for 48 years; loved ballroom dancing.' },
    ],
    personalFacts: [
      { id: 'pf-1', category: 'Career', text: 'Taught high school English Literature for 32 years.' },
      { id: 'pf-2', category: 'Favorite Song', text: '"Moon River" by Audrey Hepburn always brings calm and joy.' },
      { id: 'pf-3', category: 'Hobby', text: 'Loved rose gardening, especially yellow tea roses.' },
    ],
    caretakerNotes: [
      { id: 'cn-1', title: 'Morning Routine', text: 'Prefers warm chamomile tea with honey before breakfast.' },
      { id: 'cn-2', title: 'Sundowning Strategy', text: 'Turn on soft warm ambient lighting at 4:30 PM to ease evening agitation.' },
      { id: 'cn-3', title: 'Hearing Guidance', text: 'Speak toward her left ear in calm, measured tones without shouting.' },
    ],
  },
};

const INITIAL_MEDICATIONS = [
  normalizeMedicine({
    id: 'med-1',
    name: 'Lisinopril',
    strength: '10mg',
    dosage: '10mg',
    dose_per_intake: 1,
    unit: 'tablet',
    schedule_type: 'daily',
    times_of_day: ['08:00'],
    scheduleTime: '08:00',
    stock_count: 14,
    lead_days: 3,
    pack_size: 30,
    active: true,
    status: 'confirmed',
    instructions: 'Take 1 tablet in morning with a full glass of water.',
  }),
  normalizeMedicine({
    id: 'med-2',
    name: 'Metformin',
    strength: '500mg',
    dosage: '500mg',
    dose_per_intake: 1,
    unit: 'tablet',
    schedule_type: 'daily',
    times_of_day: ['13:00', '20:00'],
    scheduleTime: '13:00',
    stock_count: 5,
    lead_days: 3,
    pack_size: 30,
    active: true,
    status: 'pending',
    instructions: 'Take with mid-day meal and dinner.',
  }),
  normalizeMedicine({
    id: 'med-3',
    name: 'Atorvastatin',
    strength: '20mg',
    dosage: '20mg',
    dose_per_intake: 0.5,
    unit: 'tablet',
    schedule_type: 'daily',
    times_of_day: ['20:00'],
    scheduleTime: '20:00',
    stock_count: 12,
    lead_days: 3,
    pack_size: 15,
    active: true,
    status: 'pending',
    instructions: 'Take half tablet at bedtime.',
  }),
];

const INITIAL_APPOINTMENTS = [
  {
    id: 'apt-1',
    doctorName: 'Dr. Robert Chen',
    specialty: 'Cardiology',
    timestamp: new Date(Date.now() + 86400000 * 3).toISOString(),
    location: 'St. Jude Health Pavilion, Suite 305',
    notes: 'Routine 6-month blood pressure and ECG follow-up.',
    status: 'upcoming',
  },
  {
    id: 'apt-2',
    doctorName: 'Dr. Emily Watson',
    specialty: 'Audiology',
    timestamp: new Date(Date.now() + 86400000 * 8).toISOString(),
    location: 'Downtown Hearing Center, Suite 120',
    notes: 'Hearing aid cleaning and ear canal assessment.',
    status: 'upcoming',
  },
];

const LOCAL_STORAGE_KEYS = {
  profile: 'eldervoice_profile_data',
  medications: 'eldervoice_medications_data',
  appointments: 'eldervoice_appointments_data',
};

const getLocalData = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const setLocalData = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('Failed to store local cache:', err);
  }
};

/* ---------------- Profiles Collection ---------------- */

export const subscribeToProfile = (onUpdate, onError) => {
  let isFirestoreActive = false;
  let unsubscribe = () => {};

  try {
    const profileDocRef = doc(db, 'profiles', 'primary');
    unsubscribe = onSnapshot(
      profileDocRef,
      (docSnap) => {
        isFirestoreActive = true;
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() };
          setLocalData(LOCAL_STORAGE_KEYS.profile, data);
          onUpdate(data, true);
        } else {
          // Initialize primary profile if absent
          setDoc(profileDocRef, INITIAL_PROFILE, { merge: true })
            .then(() => onUpdate({ id: 'primary', ...INITIAL_PROFILE }, true))
            .catch(() => {
              const local = getLocalData(LOCAL_STORAGE_KEYS.profile, INITIAL_PROFILE);
              onUpdate(local, false);
            });
        }
      },
      (error) => {
        console.warn('Firestore profiles subscription fallback to local cache:', error.message);
        const local = getLocalData(LOCAL_STORAGE_KEYS.profile, INITIAL_PROFILE);
        onUpdate(local, false);
        if (onError) onError(error);
      }
    );
  } catch (error) {
    console.warn('Firestore initialization failed, using local profile store:', error);
    const local = getLocalData(LOCAL_STORAGE_KEYS.profile, INITIAL_PROFILE);
    onUpdate(local, false);
  }

  return () => unsubscribe();
};

export const saveProfileData = async (profileData) => {
  setLocalData(LOCAL_STORAGE_KEYS.profile, profileData);
  try {
    const profileDocRef = doc(db, 'profiles', 'primary');
    await setDoc(profileDocRef, profileData, { merge: true });
    return { success: true, live: true };
  } catch (err) {
    console.warn('Firestore profile save fallback to local storage:', err);
    return { success: true, live: false };
  }
};

/* ---------------- Medications Collection ---------------- */

export const subscribeToMedications = (onUpdate, onError) => {
  let unsubscribe = () => {};

  try {
    const medsCollection = collection(db, 'medications');
    const medsQuery = query(medsCollection, orderBy('scheduleTime', 'asc'));

    unsubscribe = onSnapshot(
      medsQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          const list = snapshot.docs.map((d) => normalizeMedicine({ id: d.id, ...d.data() }));
          setLocalData(LOCAL_STORAGE_KEYS.medications, list);
          onUpdate(list, true);
        } else {
          const local = getLocalData(LOCAL_STORAGE_KEYS.medications, INITIAL_MEDICATIONS).map(normalizeMedicine);
          setLocalData(LOCAL_STORAGE_KEYS.medications, local);
          onUpdate(local, true);
        }
      },
      (error) => {
        console.warn('Firestore medications subscription fallback to local cache:', error.message);
        const local = getLocalData(LOCAL_STORAGE_KEYS.medications, INITIAL_MEDICATIONS).map(normalizeMedicine);
        onUpdate(local, false);
        if (onError) onError(error);
      }
    );
  } catch (error) {
    console.warn('Firestore init failed for medications, using local store:', error);
    const local = getLocalData(LOCAL_STORAGE_KEYS.medications, INITIAL_MEDICATIONS).map(normalizeMedicine);
    onUpdate(local, false);
  }

  return () => unsubscribe();
};

export const addMedication = async (medication) => {
  const normalized = normalizeMedicine(medication);
  const validation = validateMedicine(normalized);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  const nowIso = new Date().toISOString();
  const newMed = {
    ...normalized,
    stock_updated_at: normalized.stock_updated_at || nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  try {
    const medsCollection = collection(db, 'medications');
    const docRef = await addDoc(medsCollection, newMed);
    const withId = { id: docRef.id, ...newMed };
    const current = getLocalData(LOCAL_STORAGE_KEYS.medications, INITIAL_MEDICATIONS);
    setLocalData(LOCAL_STORAGE_KEYS.medications, [...current, withId]);
    return { success: true, id: docRef.id, live: true };
  } catch (err) {
    console.warn('Firestore addMedication fallback to local storage:', err);
    const fallbackId = `local-med-${Date.now()}`;
    const withId = { id: fallbackId, ...newMed };
    const current = getLocalData(LOCAL_STORAGE_KEYS.medications, INITIAL_MEDICATIONS);
    const updated = [...current, withId];
    setLocalData(LOCAL_STORAGE_KEYS.medications, updated);
    return { success: true, id: fallbackId, live: false };
  }
};

export const updateMedication = async (id, updates) => {
  const current = getLocalData(LOCAL_STORAGE_KEYS.medications, INITIAL_MEDICATIONS);
  const existing = current.find((item) => item.id === id) || {};
  const merged = normalizeMedicine({ ...existing, ...updates, id });
  const validation = validateMedicine(merged);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  const nowIso = new Date().toISOString();
  const payload = {
    ...updates,
    ...merged,
    updatedAt: nowIso,
  };
  delete payload.id;

  const updated = current.map((item) => (item.id === id ? { ...item, ...payload, id } : item));
  setLocalData(LOCAL_STORAGE_KEYS.medications, updated);

  try {
    const medDocRef = doc(db, 'medications', id);
    await updateDoc(medDocRef, payload);
    return { success: true, live: true };
  } catch (err) {
    console.warn('Firestore updateMedication fallback to local storage:', err);
    return { success: true, live: false };
  }
};

export const logMedicationDoseStatus = async (med, nextStatus) => {
  const normalized = normalizeMedicine(med);
  const nowIso = new Date().toISOString();
  const updates = {
    status: nextStatus,
    updatedAt: nowIso,
  };

  if (nextStatus === 'confirmed' && normalized.status !== 'confirmed') {
    updates.stock_count = Math.max(
      0,
      Number((normalized.stock_count - normalized.dose_per_intake).toFixed(4))
    );
    updates.stock_updated_at = nowIso;
    updates.lastTakenAt = nowIso;
  }

  return updateMedication(normalized.id, updates);
};

export const refillMedicationStock = async (med, addedUnits) => {
  const normalized = normalizeMedicine(med);
  const units = Number(addedUnits);
  if (!Number.isFinite(units) || units <= 0) {
    throw new Error('Refill amount must be greater than 0.');
  }
  const nowIso = new Date().toISOString();
  return updateMedication(normalized.id, {
    stock_count: Number((normalized.stock_count + units).toFixed(4)),
    stock_updated_at: nowIso,
  });
};

export const deleteMedication = async (id) => {
  const current = getLocalData(LOCAL_STORAGE_KEYS.medications, INITIAL_MEDICATIONS);
  const filtered = current.filter((item) => item.id !== id);
  setLocalData(LOCAL_STORAGE_KEYS.medications, filtered);

  try {
    const medDocRef = doc(db, 'medications', id);
    await deleteDoc(medDocRef);
    return { success: true, live: true };
  } catch (err) {
    console.warn('Firestore deleteMedication fallback to local storage:', err);
    return { success: true, live: false };
  }
};

/* ---------------- Appointments Collection ---------------- */

export const subscribeToAppointments = (onUpdate, onError) => {
  let unsubscribe = () => {};

  try {
    const aptsCollection = collection(db, 'appointments');
    const aptsQuery = query(aptsCollection, orderBy('timestamp', 'asc'));

    unsubscribe = onSnapshot(
      aptsQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          setLocalData(LOCAL_STORAGE_KEYS.appointments, list);
          onUpdate(list, true);
        } else {
          const local = getLocalData(LOCAL_STORAGE_KEYS.appointments, INITIAL_APPOINTMENTS);
          setLocalData(LOCAL_STORAGE_KEYS.appointments, local);
          onUpdate(local, true);
        }
      },
      (error) => {
        console.warn('Firestore appointments subscription fallback to local cache:', error.message);
        const local = getLocalData(LOCAL_STORAGE_KEYS.appointments, INITIAL_APPOINTMENTS);
        onUpdate(local, false);
        if (onError) onError(error);
      }
    );
  } catch (error) {
    console.warn('Firestore init failed for appointments, using local store:', error);
    const local = getLocalData(LOCAL_STORAGE_KEYS.appointments, INITIAL_APPOINTMENTS);
    onUpdate(local, false);
  }

  return () => unsubscribe();
};

export const addAppointment = async (appointment) => {
  const newApt = {
    ...appointment,
    createdAt: new Date().toISOString(),
  };

  try {
    const aptsCollection = collection(db, 'appointments');
    const docRef = await addDoc(aptsCollection, newApt);
    const withId = { id: docRef.id, ...newApt };
    const current = getLocalData(LOCAL_STORAGE_KEYS.appointments, INITIAL_APPOINTMENTS);
    setLocalData(LOCAL_STORAGE_KEYS.appointments, [...current, withId]);
    return { success: true, id: docRef.id, live: true };
  } catch (err) {
    console.warn('Firestore addAppointment fallback to local storage:', err);
    const fallbackId = `local-apt-${Date.now()}`;
    const withId = { id: fallbackId, ...newApt };
    const current = getLocalData(LOCAL_STORAGE_KEYS.appointments, INITIAL_APPOINTMENTS);
    const updated = [...current, withId];
    setLocalData(LOCAL_STORAGE_KEYS.appointments, updated);
    return { success: true, id: fallbackId, live: false };
  }
};

export const updateAppointment = async (id, updates) => {
  const current = getLocalData(LOCAL_STORAGE_KEYS.appointments, INITIAL_APPOINTMENTS);
  const updated = current.map((item) => (item.id === id ? { ...item, ...updates } : item));
  setLocalData(LOCAL_STORAGE_KEYS.appointments, updated);

  try {
    const aptDocRef = doc(db, 'appointments', id);
    await updateDoc(aptDocRef, updates);
    return { success: true, live: true };
  } catch (err) {
    console.warn('Firestore updateAppointment fallback to local storage:', err);
    return { success: true, live: false };
  }
};

export const deleteAppointment = async (id) => {
  const current = getLocalData(LOCAL_STORAGE_KEYS.appointments, INITIAL_APPOINTMENTS);
  const filtered = current.filter((item) => item.id !== id);
  setLocalData(LOCAL_STORAGE_KEYS.appointments, filtered);

  try {
    const aptDocRef = doc(db, 'appointments', id);
    await deleteDoc(aptDocRef);
    return { success: true, live: true };
  } catch (err) {
    console.warn('Firestore deleteAppointment fallback to local storage:', err);
    return { success: true, live: false };
  }
};

