import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const Profile = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getMyProfile();
        setProfile(data.data?.user || data.user || null);
      } catch (e) {
        try {
          const cached = JSON.parse(localStorage.getItem('civicconnect_user'));
          setProfile(cached || null);
        } catch (_) {}
        setError('Could not fetch profile from server');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f7fa]">
        <div className="bg-white px-10 py-6 rounded-2xl shadow animate-pulse">
          Loading profile…
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f7fa]">
        <div className="bg-white px-10 py-6 rounded-2xl shadow">
          No profile found.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7fa]">

      {/* ===== HEADER (standalone, no overlap) ===== */}
      <header className="bg-gradient-to-r from-[#12394a] to-[#1f4f63]">
        <div className="max-w-6xl mx-auto px-8 py-12">
          <h1 className="text-4xl font-bold text-white tracking-tight">
            My Profile
          </h1>
          <p className="mt-1 text-base text-blue-100 max-w-xl">
            Official citizen identity information registered with CivicConnect
          </p>
        </div>
      </header>

      {/* ===== CARD SECTION (CLEARLY SEPARATED) ===== */}
      <main className="flex justify-center px-6 py-16">
        <div className="w-full max-w-4xl bg-white rounded-[28px] shadow-2xl p-12">

          {error && (
            <div className="mb-8 text-sm text-red-700 bg-red-50 px-5 py-3 rounded-xl border border-red-200">
              {error}
            </div>
          )}

          {/* Personal Identity */}
          <section className="mb-12">
            <h2 className="text-lg font-semibold text-[#12394a]">
              Personal Identity
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Core citizen details used across the platform
            </p>

            <div className="mt-8 space-y-6">
              <ProfileRow label="Full Name" value={profile.name} />
              <ProfileRow label="Aadhaar Number" value={profile.aadhaarNumber} />
              <ProfileRow label="Mobile Number" value={profile.mobile} />
            </div>
          </section>

          {/* Platform Access */}
          <section className="pt-8 border-t border-gray-200">
            <h2 className="text-lg font-semibold text-[#12394a]">
              Platform Access
            </h2>

            <div className="mt-6">
              <ProfileRow label="Civic Role" value="Citizen" />
            </div>
          </section>

          {/* Action */}
          <div className="mt-14">
            <button
              onClick={() => navigate('/citizen')}
              className="w-full py-4 rounded-xl
                         bg-[#12394a] text-white
                         text-lg font-semibold
                         hover:bg-[#0f2f3d]
                         transition-all"
            >
              Back to Dashboard
            </button>
          </div>

        </div>
      </main>
    </div>
  );
};

const ProfileRow = ({ label, value }) => (
  <div className="flex items-baseline justify-between">
    <div className="flex items-baseline gap-4">
      <span className="w-44 text-sm font-medium text-gray-500">
        {label}
      </span>
      <span className="text-gray-400">:</span>
    </div>

    <span className="text-xl font-semibold text-[#12394a] tracking-tight">
      {value || '-'}
    </span>
  </div>
);

export default Profile;
