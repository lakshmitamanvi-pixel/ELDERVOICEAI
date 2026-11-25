import React, { useState, useEffect } from 'react';
import {
  Brain,
  Users,
  Bookmark,
  PhoneCall,
  Save,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';

export const MemoryVaultManager = ({ profile = {}, onSaveProfile }) => {
  const [formData, setFormData] = useState({
    fullName: profile.fullName || 'Eleanor Vance',
    preferredName: profile.preferredName || 'Ellie',
    age: profile.age || 78,
    primaryLanguage: profile.primaryLanguage || 'en-US',
    bloodType: profile.bloodType || 'O+',
    allergies: profile.allergies || 'Penicillin',
    medicalNotes: {
      primaryPhysician: profile.medicalNotes?.primaryPhysician || '',
      physicianPhone: profile.medicalNotes?.physicianPhone || '',
      conditions: profile.medicalNotes?.conditions || '',
      dietaryRestrictions: profile.medicalNotes?.dietaryRestrictions || '',
    },
    emergencyContacts: profile.emergencyContacts || [],
    memoryVault: {
      familyMembers: profile.memoryVault?.familyMembers || [],
      personalFacts: profile.memoryVault?.personalFacts || [],
      caretakerNotes: profile.memoryVault?.caretakerNotes || [],
    },
  });

  const [activeSection, setActiveSection] = useState('vault'); // 'vault' | 'medical' | 'contacts'
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Memory Vault sub-item adders & editors
  const [newFamily, setNewFamily] = useState({ name: '', relationship: '', note: '' });
  const [editingFamilyId, setEditingFamilyId] = useState(null);
  const [editFamilyData, setEditFamilyData] = useState({ name: '', relationship: '', note: '' });

  const [newFact, setNewFact] = useState({ category: 'Memory', text: '' });
  const [editingFactId, setEditingFactId] = useState(null);
  const [editFactData, setEditFactData] = useState({ category: '', text: '' });

  const [newContact, setNewContact] = useState({ name: '', relationship: '', phone: '' });

  useEffect(() => {
    if (profile && Object.keys(profile).length > 0) {
      setFormData((prev) => ({
        ...prev,
        ...profile,
        medicalNotes: { ...prev.medicalNotes, ...(profile.medicalNotes || {}) },
        emergencyContacts: profile.emergencyContacts || prev.emergencyContacts,
        memoryVault: {
          ...prev.memoryVault,
          ...(profile.memoryVault || {}),
        },
      }));
    }
  }, [profile]);

  const persistUpdate = async (updatedData) => {
    setFormData(updatedData);
    if (onSaveProfile) {
      try {
        await onSaveProfile(updatedData);
      } catch (err) {
        console.warn('Auto-save memory update failed:', err);
      }
    }
  };

  const handleAddFamilyMember = () => {
    if (!newFamily.name.trim()) return;
    const item = {
      id: `fm-${Date.now()}`,
      name: newFamily.name.trim(),
      relationship: newFamily.relationship.trim(),
      note: newFamily.note.trim(),
    };
    const updated = {
      ...formData,
      memoryVault: {
        ...formData.memoryVault,
        familyMembers: [...(formData.memoryVault.familyMembers || []), item],
      },
    };
    persistUpdate(updated);
    setNewFamily({ name: '', relationship: '', note: '' });
  };

  const handleStartEditFamily = (fm) => {
    setEditingFamilyId(fm.id);
    setEditFamilyData({ name: fm.name || '', relationship: fm.relationship || '', note: fm.note || '' });
  };

  const handleSaveEditFamily = (id) => {
    if (!editFamilyData.name.trim()) return;
    const updated = {
      ...formData,
      memoryVault: {
        ...formData.memoryVault,
        familyMembers: (formData.memoryVault.familyMembers || []).map((m) =>
          m.id === id
            ? { ...m, name: editFamilyData.name.trim(), relationship: editFamilyData.relationship.trim(), note: editFamilyData.note.trim() }
            : m
        ),
      },
    };
    persistUpdate(updated);
    setEditingFamilyId(null);
  };

  const handleDeleteFamilyMember = (id) => {
    const updated = {
      ...formData,
      memoryVault: {
        ...formData.memoryVault,
        familyMembers: (formData.memoryVault.familyMembers || []).filter((m) => m.id !== id),
      },
    };
    persistUpdate(updated);
  };

  const handleAddFact = () => {
    if (!newFact.text.trim()) return;
    const item = {
      id: `pf-${Date.now()}`,
      category: newFact.category.trim() || 'Memory',
      text: newFact.text.trim(),
    };
    const updated = {
      ...formData,
      memoryVault: {
        ...formData.memoryVault,
        personalFacts: [...(formData.memoryVault.personalFacts || []), item],
      },
    };
    persistUpdate(updated);
    setNewFact({ category: 'Memory', text: '' });
  };

  const handleStartEditFact = (fact) => {
    setEditingFactId(fact.id);
    setEditFactData({ category: fact.category || 'Memory', text: fact.text || '' });
  };

  const handleSaveEditFact = (id) => {
    if (!editFactData.text.trim()) return;
    const updated = {
      ...formData,
      memoryVault: {
        ...formData.memoryVault,
        personalFacts: (formData.memoryVault.personalFacts || []).map((f) =>
          f.id === id
            ? { ...f, category: editFactData.category.trim() || 'Memory', text: editFactData.text.trim() }
            : f
        ),
      },
    };
    persistUpdate(updated);
    setEditingFactId(null);
  };

  const handleDeleteFact = (id) => {
    const updated = {
      ...formData,
      memoryVault: {
        ...formData.memoryVault,
        personalFacts: (formData.memoryVault.personalFacts || []).filter((f) => f.id !== id),
      },
    };
    persistUpdate(updated);
  };

  const handleAddEmergencyContact = () => {
    if (!newContact.name.trim() || !newContact.phone.trim()) return;
    const item = {
      id: `ec-${Date.now()}`,
      name: newContact.name.trim(),
      relationship: newContact.relationship.trim(),
      phone: newContact.phone.trim(),
      isPrimary: (formData.emergencyContacts || []).length === 0,
    };
    setFormData((prev) => ({
      ...prev,
      emergencyContacts: [...(prev.emergencyContacts || []), item],
    }));
    setNewContact({ name: '', relationship: '', phone: '' });
  };

  const handleDeleteEmergencyContact = (id) => {
    setFormData((prev) => ({
      ...prev,
      emergencyContacts: prev.emergencyContacts.filter((c) => c.id !== id),
    }));
  };

  const handleSaveAll = async (e) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setSaveError('');
    try {
      await onSaveProfile(formData);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      console.error('Failed to sync profile to Firestore:', err);
      setSaveError('Failed to synchronize with Firestore.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Save Control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold text-elderBlue-950">
            Senior Profile & Memory Vault
          </h3>
          <p className="text-lg text-elderBlue-700 font-medium mt-0.5">
            Personal history, family connections, reminiscence prompts, and medical directives.
          </p>
        </div>

        <button
          onClick={handleSaveAll}
          disabled={isSaving}
          className="min-h-[60px] px-8 py-3 rounded-2xl bg-emeraldSuccess-700 hover:bg-emeraldSuccess-800 text-white font-bold text-xl flex items-center justify-center gap-2 shadow-md focus:ring-4 focus:ring-emeraldSuccess-300"
        >
          {isSaving ? (
            <>
              <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
              <span>Saving Changes...</span>
            </>
          ) : saveSuccess ? (
            <>
              <CheckCircle2 className="w-7 h-7 stroke-[2.5]" aria-hidden="true" />
              <span>Saved to Firestore!</span>
            </>
          ) : (
            <>
              <Save className="w-7 h-7 stroke-[2.5]" aria-hidden="true" />
              <span>Save All Updates</span>
            </>
          )}
        </button>
      </div>

      {saveError && (
        <div className="p-4 rounded-2xl bg-crimsonAlert-50 border-2 border-crimsonAlert-300 text-crimsonAlert-900 text-lg font-bold flex items-center gap-3">
          <AlertCircle className="w-6 h-6 stroke-[2.5] text-crimsonAlert-700" aria-hidden="true" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Sub-Section Navigation */}
      <div className="flex gap-2 p-1.5 bg-warmWhite-paper border-2 border-elderBlue-200 rounded-2xl">
        <button
          onClick={() => setActiveSection('vault')}
          className={`flex-1 min-h-[48px] px-4 py-2 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-colors ${
            activeSection === 'vault'
              ? 'bg-elderBlue-900 text-warmWhite shadow-sm'
              : 'text-elderBlue-900 hover:bg-elderBlue-100'
          }`}
        >
          <Brain className="w-6 h-6" aria-hidden="true" />
          <span>Manage Memories</span>
        </button>

        <button
          onClick={() => setActiveSection('medical')}
          className={`flex-1 min-h-[48px] px-4 py-2 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-colors ${
            activeSection === 'medical'
              ? 'bg-elderBlue-900 text-warmWhite shadow-sm'
              : 'text-elderBlue-900 hover:bg-elderBlue-100'
          }`}
        >
          <ShieldCheck className="w-6 h-6" aria-hidden="true" />
          <span>Medical Profile</span>
        </button>

        <button
          onClick={() => setActiveSection('contacts')}
          className={`flex-1 min-h-[48px] px-4 py-2 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-colors ${
            activeSection === 'contacts'
              ? 'bg-elderBlue-900 text-warmWhite shadow-sm'
              : 'text-elderBlue-900 hover:bg-elderBlue-100'
          }`}
        >
          <PhoneCall className="w-6 h-6" aria-hidden="true" />
          <span>Emergency Contacts</span>
        </button>
      </div>

      {/* SECTION 1: MANAGE MEMORIES (Add / Edit / Delete People & Anecdotes) */}
      {activeSection === 'vault' && (
        <div className="space-y-6">
          {/* Manage People */}
          <div className="bg-white border-3 border-elderBlue-100 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center gap-3 pb-4 border-b-2 border-elderBlue-100">
              <Users className="w-7 h-7 text-elderBlue-800 stroke-[2.5]" aria-hidden="true" />
              <div>
                <h4 className="text-2xl font-bold text-elderBlue-950">Manage People & Family</h4>
                <p className="text-lg text-elderBlue-700">Add, edit, or remove people shown in the Senior View.</p>
              </div>
            </div>

            <div className="space-y-3 mt-4">
              {(formData.memoryVault.familyMembers || []).map((fm) => (
                <div
                  key={fm.id}
                  className="p-3.5 rounded-2xl bg-warmWhite-paper border-2 border-elderBlue-200 flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  {editingFamilyId === fm.id ? (
                    <div className="flex-1 flex flex-col md:flex-row gap-2">
                      <input
                        type="text"
                        value={editFamilyData.name}
                        onChange={(e) => setEditFamilyData({ ...editFamilyData, name: e.target.value })}
                        placeholder="Name"
                        className="w-full md:w-1/4 min-h-[44px] px-3 text-base font-semibold bg-white border-2 border-elderBlue-300 rounded-xl"
                      />
                      <input
                        type="text"
                        value={editFamilyData.relationship}
                        onChange={(e) => setEditFamilyData({ ...editFamilyData, relationship: e.target.value })}
                        placeholder="Relation"
                        className="w-full md:w-1/4 min-h-[44px] px-3 text-base font-semibold bg-white border-2 border-elderBlue-300 rounded-xl"
                      />
                      <input
                        type="text"
                        value={editFamilyData.note}
                        onChange={(e) => setEditFamilyData({ ...editFamilyData, note: e.target.value })}
                        placeholder="1-line anecdote"
                        className="w-full md:w-1/2 min-h-[44px] px-3 text-base font-semibold bg-white border-2 border-elderBlue-300 rounded-xl"
                      />
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSaveEditFamily(fm.id)}
                          aria-label={`Save ${fm.name}`}
                          className="p-2.5 bg-emeraldSuccess-700 text-white rounded-xl hover:bg-emeraldSuccess-800"
                        >
                          <Check className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingFamilyId(null)}
                          aria-label="Cancel edit"
                          className="p-2.5 bg-elderBlue-100 text-elderBlue-900 rounded-xl hover:bg-elderBlue-200"
                        >
                          <X className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-lg text-elderBlue-950">
                        <span className="font-bold">{fm.name}</span>{' '}
                        <span className="text-elderBlue-700 font-semibold">({fm.relationship})</span>
                        {fm.note && <span className="text-elderBlue-800"> — {fm.note}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartEditFamily(fm)}
                          aria-label={`Edit ${fm.name}`}
                          className="p-2 text-elderBlue-800 hover:bg-elderBlue-100 rounded-xl"
                        >
                          <Edit2 className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteFamilyMember(fm.id)}
                          aria-label={`Remove ${fm.name}`}
                          className="p-2 text-crimsonAlert-700 hover:bg-crimsonAlert-50 rounded-xl"
                        >
                          <Trash2 className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Add Person Form */}
            <div className="mt-5 p-4 rounded-2xl bg-elderBlue-50 border-2 border-elderBlue-200 flex flex-col md:flex-row gap-3 items-center">
              <input
                type="text"
                placeholder="Name (e.g. Sarah)"
                value={newFamily.name}
                onChange={(e) => setNewFamily({ ...newFamily, name: e.target.value })}
                className="w-full md:w-1/4 min-h-[50px] px-3 text-lg font-semibold bg-white border-2 border-elderBlue-200 rounded-xl text-elderBlue-950"
              />
              <input
                type="text"
                placeholder="Relation (e.g. Daughter)"
                value={newFamily.relationship}
                onChange={(e) => setNewFamily({ ...newFamily, relationship: e.target.value })}
                className="w-full md:w-1/4 min-h-[50px] px-3 text-lg font-semibold bg-white border-2 border-elderBlue-200 rounded-xl text-elderBlue-950"
              />
              <input
                type="text"
                placeholder="1-line anecdote (e.g. Visits Sundays with Leo)"
                value={newFamily.note}
                onChange={(e) => setNewFamily({ ...newFamily, note: e.target.value })}
                className="w-full md:w-1/2 min-h-[50px] px-3 text-lg font-semibold bg-white border-2 border-elderBlue-200 rounded-xl text-elderBlue-950"
              />
              <button
                type="button"
                onClick={handleAddFamilyMember}
                className="w-full md:w-auto min-h-[50px] px-5 py-2 rounded-xl bg-elderBlue-900 text-warmWhite font-bold text-lg hover:bg-elderBlue-950 flex items-center justify-center gap-1.5 flex-shrink-0"
              >
                <Plus className="w-5 h-5" aria-hidden="true" />
                <span>Add</span>
              </button>
            </div>
          </div>

          {/* Manage Anecdotes */}
          <div className="bg-white border-3 border-elderBlue-100 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center gap-3 pb-4 border-b-2 border-elderBlue-100">
              <Bookmark className="w-7 h-7 text-elderBlue-800 stroke-[2.5]" aria-hidden="true" />
              <div>
                <h4 className="text-2xl font-bold text-elderBlue-950">Manage Anecdotes & Memories</h4>
                <p className="text-lg text-elderBlue-700">Add, edit, or remove personal anecdotes shown in the Senior View.</p>
              </div>
            </div>

            <div className="space-y-3 mt-4">
              {(formData.memoryVault.personalFacts || []).map((fact) => (
                <div
                  key={fact.id}
                  className="p-3.5 rounded-2xl bg-warmWhite-paper border-2 border-elderBlue-200 flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  {editingFactId === fact.id ? (
                    <div className="flex-1 flex flex-col md:flex-row gap-2">
                      <input
                        type="text"
                        value={editFactData.category}
                        onChange={(e) => setEditFactData({ ...editFactData, category: e.target.value })}
                        placeholder="Category"
                        className="w-full md:w-1/3 min-h-[44px] px-3 text-base font-semibold bg-white border-2 border-elderBlue-300 rounded-xl"
                      />
                      <input
                        type="text"
                        value={editFactData.text}
                        onChange={(e) => setEditFactData({ ...editFactData, text: e.target.value })}
                        placeholder="Anecdote text"
                        className="w-full md:w-2/3 min-h-[44px] px-3 text-base font-semibold bg-white border-2 border-elderBlue-300 rounded-xl"
                      />
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSaveEditFact(fact.id)}
                          aria-label={`Save ${fact.category}`}
                          className="p-2.5 bg-emeraldSuccess-700 text-white rounded-xl hover:bg-emeraldSuccess-800"
                        >
                          <Check className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingFactId(null)}
                          aria-label="Cancel edit"
                          className="p-2.5 bg-elderBlue-100 text-elderBlue-900 rounded-xl hover:bg-elderBlue-200"
                        >
                          <X className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-lg text-elderBlue-950">
                        <span className="font-bold text-elderBlue-700 uppercase text-base mr-2">[{fact.category}]</span>
                        <span className="font-medium">{fact.text}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartEditFact(fact)}
                          aria-label={`Edit ${fact.category}`}
                          className="p-2 text-elderBlue-800 hover:bg-elderBlue-100 rounded-xl"
                        >
                          <Edit2 className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteFact(fact.id)}
                          aria-label={`Remove ${fact.text}`}
                          className="p-2 text-crimsonAlert-700 hover:bg-crimsonAlert-50 rounded-xl"
                        >
                          <Trash2 className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Add Anecdote Form */}
            <div className="mt-5 p-4 rounded-2xl bg-elderBlue-50 border-2 border-elderBlue-200 flex flex-col md:flex-row gap-3 items-center">
              <input
                type="text"
                placeholder="Category (e.g. Favorite Song, Career)"
                value={newFact.category}
                onChange={(e) => setNewFact({ ...newFact, category: e.target.value })}
                className="w-full md:w-1/3 min-h-[50px] px-3 text-lg font-semibold bg-white border-2 border-elderBlue-200 rounded-xl text-elderBlue-950"
              />
              <input
                type="text"
                placeholder="Anecdote or memory (e.g. Loved rose gardening)"
                value={newFact.text}
                onChange={(e) => setNewFact({ ...newFact, text: e.target.value })}
                className="w-full md:w-2/3 min-h-[50px] px-3 text-lg font-semibold bg-white border-2 border-elderBlue-200 rounded-xl text-elderBlue-950"
              />
              <button
                type="button"
                onClick={handleAddFact}
                className="w-full md:w-auto min-h-[50px] px-5 py-2 rounded-xl bg-elderBlue-900 text-warmWhite font-bold text-lg hover:bg-elderBlue-950 flex items-center justify-center gap-1.5 flex-shrink-0"
              >
                <Plus className="w-5 h-5" aria-hidden="true" />
                <span>Add</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: MEDICAL PROFILE */}
      {activeSection === 'medical' && (
        <div className="bg-white border-3 border-elderBlue-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <h4 className="text-2xl font-bold text-elderBlue-950 pb-2 border-b-2 border-elderBlue-100">
            Personal & Health Records
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label htmlFor="prof-fullname" className="block text-xl font-bold text-elderBlue-900 mb-2">
                Full Legal Name
              </label>
              <input
                id="prof-fullname"
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="w-full min-h-[60px] px-4 text-xl font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="prof-prefname" className="block text-xl font-bold text-elderBlue-900 mb-2">
                Preferred Name / Nickname
              </label>
              <input
                id="prof-prefname"
                type="text"
                value={formData.preferredName}
                onChange={(e) => setFormData({ ...formData, preferredName: e.target.value })}
                className="w-full min-h-[60px] px-4 text-xl font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="prof-age" className="block text-xl font-bold text-elderBlue-900 mb-2">
                Age
              </label>
              <input
                id="prof-age"
                type="number"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: Number(e.target.value) })}
                className="w-full min-h-[60px] px-4 text-xl font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="prof-allergies" className="block text-xl font-bold text-crimsonAlert-900 mb-2">
                Documented Allergies
              </label>
              <input
                id="prof-allergies"
                type="text"
                value={formData.allergies}
                onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                className="w-full min-h-[60px] px-4 text-xl font-semibold bg-white border-3 border-crimsonAlert-200 rounded-2xl text-crimsonAlert-950 focus:ring-4 focus:ring-crimsonAlert-300 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="prof-blood" className="block text-xl font-bold text-elderBlue-900 mb-2">
                Blood Type
              </label>
              <input
                id="prof-blood"
                type="text"
                value={formData.bloodType}
                onChange={(e) => setFormData({ ...formData, bloodType: e.target.value })}
                className="w-full min-h-[60px] px-4 text-xl font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="prof-physician" className="block text-xl font-bold text-elderBlue-900 mb-2">
                Primary Care Physician
              </label>
              <input
                id="prof-physician"
                type="text"
                value={formData.medicalNotes.primaryPhysician}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    medicalNotes: { ...formData.medicalNotes, primaryPhysician: e.target.value },
                  })
                }
                className="w-full min-h-[60px] px-4 text-xl font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="prof-phone" className="block text-xl font-bold text-elderBlue-900 mb-2">
                Physician Phone Number
              </label>
              <input
                id="prof-phone"
                type="text"
                value={formData.medicalNotes.physicianPhone}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    medicalNotes: { ...formData.medicalNotes, physicianPhone: e.target.value },
                  })
                }
                className="w-full min-h-[60px] px-4 text-xl font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="prof-conditions" className="block text-xl font-bold text-elderBlue-900 mb-2">
              Chronic Diagnoses & Medical Conditions
            </label>
            <textarea
              id="prof-conditions"
              rows={3}
              value={formData.medicalNotes.conditions}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  medicalNotes: { ...formData.medicalNotes, conditions: e.target.value },
                })
              }
              className="w-full p-4 text-xl font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* SECTION 3: EMERGENCY CONTACTS */}
      {activeSection === 'contacts' && (
        <div className="bg-white border-3 border-elderBlue-100 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b-2 border-elderBlue-100">
            <PhoneCall className="w-7 h-7 text-crimsonAlert-700 stroke-[2.5]" aria-hidden="true" />
            <div>
              <h4 className="text-2xl font-bold text-elderBlue-950">Emergency Contact Hierarchy</h4>
              <p className="text-lg text-elderBlue-700">
                Dispatched automatically via SMS/Email when Senior presses the SOS button.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {(formData.emergencyContacts || []).map((contact) => (
              <div
                key={contact.id}
                className="p-5 rounded-2xl bg-warmWhite-paper border-2 border-elderBlue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h5 className="text-2xl font-bold text-elderBlue-950">{contact.name}</h5>
                    <span className="text-lg font-bold text-elderBlue-700">({contact.relationship})</span>
                    {contact.isPrimary && (
                      <span className="px-3 py-1 bg-emeraldSuccess-100 border border-emeraldSuccess-400 text-emeraldSuccess-950 text-base font-bold rounded-full">
                        Primary Responder
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-bold text-elderBlue-900 mt-2">{contact.phone}</p>
                </div>

                <button
                  onClick={() => handleDeleteEmergencyContact(contact.id)}
                  aria-label={`Remove ${contact.name}`}
                  className="self-start sm:self-center p-3 text-crimsonAlert-700 hover:bg-crimsonAlert-50 rounded-xl"
                >
                  <Trash2 className="w-6 h-6 stroke-[2.5]" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>

          {/* Add Contact Inline */}
          <div className="p-4 rounded-2xl bg-elderBlue-50 border-2 border-elderBlue-200 flex flex-col md:flex-row gap-3 items-center">
            <input
              type="text"
              placeholder="Contact Name (e.g. Sarah Vance)"
              value={newContact.name}
              onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
              className="w-full md:w-1/3 min-h-[50px] px-3 text-lg font-semibold bg-white border-2 border-elderBlue-200 rounded-xl text-elderBlue-950"
            />
            <input
              type="text"
              placeholder="Relationship (e.g. Daughter)"
              value={newContact.relationship}
              onChange={(e) => setNewContact({ ...newContact, relationship: e.target.value })}
              className="w-full md:w-1/3 min-h-[50px] px-3 text-lg font-semibold bg-white border-2 border-elderBlue-200 rounded-xl text-elderBlue-950"
            />
            <input
              type="tel"
              placeholder="Phone (e.g. 555-912-3456)"
              value={newContact.phone}
              onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
              className="w-full md:w-1/3 min-h-[50px] px-3 text-lg font-semibold bg-white border-2 border-elderBlue-200 rounded-xl text-elderBlue-950"
            />
            <button
              type="button"
              onClick={handleAddEmergencyContact}
              className="w-full md:w-auto min-h-[50px] px-6 py-2 rounded-xl bg-elderBlue-900 text-warmWhite font-bold text-lg hover:bg-elderBlue-950 flex items-center justify-center gap-1.5 flex-shrink-0"
            >
              <Plus className="w-5 h-5" aria-hidden="true" />
              <span>Add Contact</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemoryVaultManager;

