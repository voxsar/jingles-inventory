import { useEffect, useState } from 'react';
import { usersApi, vendorsApi } from '../api/client';
import PaginatedDataTable from '../components/PaginatedDataTable';
import SearchableSelect from '../components/SearchableSelect';

const defaultUserForm = {
  email: '',
  password: '',
  pin: '',
  role: 'Staff',
  vendorId: '',
  isActive: true,
};

const roleOptions = ['Admin', 'Manager', 'Staff', 'Inspector', 'Vendor'];

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [userForm, setUserForm] = useState(defaultUserForm);
  const [newPassword, setNewPassword] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = {};
      if (roleFilter) params.role = roleFilter;
      if (activeFilter) params.isActive = activeFilter;
      if (searchTerm) params.search = searchTerm;
      if (vendorFilter) params.vendorId = vendorFilter;

      const res = await usersApi.list(params);
      const data = res.data?.data ?? res.data ?? [];
      setUsers(Array.isArray(data) ? data : []);
    } finally {
      setIsLoading(false);
    }
  };

  const loadVendors = async () => {
    try {
      const res = await vendorsApi.list();
      const data = res.data?.data ?? res.data ?? [];
      setVendors(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load vendors', error);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [roleFilter, activeFilter, searchTerm, vendorFilter]);

  useEffect(() => {
    loadVendors();
  }, []);

  const openCreateModal = () => {
    setEditingUser(null);
    setUserForm(defaultUserForm);
    setShowModal(true);
  };

  const openEditModal = (user: any) => {
    setEditingUser(user);
    setUserForm({
      email: user.email || '',
      password: '', // Don't populate password
      pin: '', // PIN hashes are never returned by the API
      role: user.role || 'Staff',
      vendorId: user.vendorId || '',
      isActive: user.isActive !== false,
    });
    setShowModal(true);
  };

  const openPasswordModal = (user: any) => {
    setEditingUser(user);
    setNewPassword('');
    setShowPasswordModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setShowPasswordModal(false);
    setEditingUser(null);
    setUserForm(defaultUserForm);
    setNewPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { vendorId, password, pin, ...rest } = userForm;
      const payload: Record<string, any> = { ...rest };

      if (pin) {
        if (!/^\d{4,6}$/.test(pin)) {
          alert('PIN must contain 4 to 6 digits');
          return;
        }
        if (pin === pin.split('').reverse().join('')) {
          alert('PIN cannot read the same forwards and backwards');
          return;
        }
        payload.pin = pin;
      } else if (!editingUser) {
        alert('A 4 to 6 digit PIN is required');
        return;
      }

      // Include vendorId only if non-empty
      if (vendorId) {
        payload.vendorId = vendorId;
      }

      if (editingUser) {
        // Don't send password in update unless changing it
        await usersApi.update(editingUser.id, payload);
      } else {
        if (!password || password.length < 6) {
          alert('Password must be at least 6 characters');
          return;
        }
        await usersApi.create({ ...payload, password });
      }
      await loadUsers();
      closeModal();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to save user');
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }
    try {
      await usersApi.updatePassword(editingUser.id, newPassword);
      alert('Password updated successfully');
      closeModal();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to update password');
    }
  };

  const handleDelete = async (user: any) => {
    if (!confirm(`Deactivate user "${user.email}"?`)) return;
    try {
      await usersApi.delete(user.id);
      await loadUsers();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to deactivate user');
    }
  };

  const userColumns = [
    { header: 'Email', key: 'email', sortable: true },
    {
      header: 'Role',
      key: 'role',
      render: (row: any) => (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
          {row.role}
        </span>
      ),
    },
    {
      header: 'Vendor',
      key: 'vendor',
      render: (row: any) =>
        row.vendor ? (
          <span className="text-sm text-gray-700">{row.vendor.name}</span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      header: 'PIN Lock',
      key: 'hasPin',
      render: (row: any) => row.hasPin ? (
        <span className="text-sm font-medium text-green-700">Configured</span>
      ) : (
        <span className="text-sm font-medium text-amber-700">Setup needed</span>
      ),
    },
    {
      header: 'Status',
      key: 'isActive',
      render: (row: any) =>
        row.isActive ? (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
            Active
          </span>
        ) : (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
            Inactive
          </span>
        ),
    },
    {
      header: 'Created',
      key: 'createdAt',
      render: (row: any) => new Date(row.createdAt).toLocaleDateString(),
    },
    {
      header: 'Actions',
      key: 'id',
      render: (row: any) => (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => openEditModal(row)}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => openPasswordModal(row)}
            className="px-3 py-1 text-sm bg-purple-500 text-white rounded hover:bg-purple-600"
          >
            Password
          </button>
          {row.isActive && (
            <button
              type="button"
              onClick={() => handleDelete(row)}
              className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
            >
              Deactivate
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h2 className="text-2xl font-bold text-gray-900">👥 User Management</h2>
        <button
          type="button"
          onClick={openCreateModal}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          + Create User
        </button>
      </div>

      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search by email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <div style={{ width: '180px' }}>
          <SearchableSelect
            options={[
              { value: '', label: 'All Roles' },
              ...roleOptions.map((role) => ({ value: role, label: role })),
            ]}
            value={roleFilter}
            onChange={(value) => setRoleFilter(value)}
            placeholder="All Roles"
            isClearable={false}
          />
        </div>
        <div style={{ width: '180px' }}>
          <SearchableSelect
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'true', label: 'Active' },
              { value: 'false', label: 'Inactive' },
            ]}
            value={activeFilter}
            onChange={(value) => setActiveFilter(value)}
            placeholder="All Statuses"
            isClearable={false}
          />
        </div>
        <div style={{ width: '220px' }}>
          <SearchableSelect
            options={[
              { value: '', label: 'All Vendors' },
              ...vendors.map((vendor: any) => ({ value: vendor.id, label: vendor.name })),
            ]}
            value={vendorFilter}
            onChange={(value) => setVendorFilter(value)}
            placeholder="All Vendors"
            isClearable={false}
          />
        </div>
        {(searchTerm || roleFilter || activeFilter || vendorFilter) && (
          <button
            type="button"
            onClick={() => { setSearchTerm(''); setRoleFilter(''); setActiveFilter(''); setVendorFilter(''); }}
            className="btn-secondary text-xs"
          >
            ✕ Clear filters
          </button>
        )}
      </div>

      <div className="content-section">
        {isLoading ? (
          <p className="text-center text-gray-600">Loading...</p>
        ) : (
          <PaginatedDataTable columns={userColumns} data={users} />
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-panel-md">
            <div className="modal-header">
              <h3 className="modal-title">{editingUser ? 'Edit User' : 'Create User'}</h3>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body form-stack">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password * (min 6 characters)
                  </label>
                  <input
                    type="password"
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    required={!editingUser}
                    minLength={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {editingUser ? 'New PIN (leave blank to keep current)' : 'PIN *'}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  pattern="[0-9]{4,6}"
                  minLength={4}
                  maxLength={6}
                  value={userForm.pin}
                  onChange={(e) => setUserForm({ ...userForm, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                  required={!editingUser}
                  placeholder="4–6 digits"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Used to unlock the screen after 60 seconds of inactivity. Palindromic PINs are not allowed.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role *
                </label>
                <SearchableSelect
                  options={roleOptions.map((role) => ({ value: role, label: role }))}
                  value={userForm.role}
                  onChange={(value) => setUserForm({ ...userForm, role: value })}
                  isClearable={false}
                />
              </div>

              {userForm.role === 'Vendor' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vendor *
                  </label>
                  <SearchableSelect
                    options={[{ value: '', label: 'Select Vendor' }, ...vendors.map((vendor) => ({ value: vendor.id, label: vendor.name }))]}
                    value={userForm.vendorId}
                    onChange={(value) => setUserForm({ ...userForm, vendorId: value })}
                    isClearable={false}
                  />
                </div>
              )}

              {editingUser && (
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={userForm.isActive}
                      onChange={(e) => setUserForm({ ...userForm, isActive: e.target.checked })}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Active</span>
                  </label>
                </div>
              )}
              </div>

              <div className="modal-footer">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  {editingUser ? 'Update' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPasswordModal && (
        <div className="modal-overlay">
          <div className="modal-panel-md">
            <div className="modal-header">
              <h3 className="modal-title">Change Password for {editingUser?.email}</h3>
            </div>
            <form onSubmit={handlePasswordSubmit}>
              <div className="modal-body">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password * (min 6 characters)
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="modal-footer">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Update Password
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
