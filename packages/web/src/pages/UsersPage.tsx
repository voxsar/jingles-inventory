import { useEffect, useState } from 'react';
import { usersApi, vendorsApi } from '../api/client';
import DataTable from '../components/DataTable';

const defaultUserForm = {
  email: '',
  password: '',
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

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = {};
      if (roleFilter) params.role = roleFilter;
      if (activeFilter) params.isActive = activeFilter;
      if (searchTerm) params.search = searchTerm;

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
  }, [roleFilter, activeFilter, searchTerm]);

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
      const payload = { ...userForm };

      // Remove empty vendorId
      if (!payload.vendorId) {
        delete payload.vendorId;
      }

      if (editingUser) {
        // Don't send password in update unless changing it
        delete payload.password;
        await usersApi.update(editingUser.id, payload);
      } else {
        if (!payload.password || payload.password.length < 6) {
          alert('Password must be at least 6 characters');
          return;
        }
        await usersApi.create(payload);
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
    { key: 'email', header: 'Email', sortable: true },
    {
      key: 'role',
      header: 'Role',
      render: (row: any) => (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
          {row.role}
        </span>
      ),
    },
    {
      key: 'vendor',
      header: 'Vendor',
      render: (row: any) =>
        row.vendor ? (
          <span className="text-sm text-gray-700">{row.vendor.name}</span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'isActive',
      header: 'Status',
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
      key: 'createdAt',
      header: 'Created',
      render: (row: any) => new Date(row.createdAt).toLocaleDateString(),
    },
    {
      key: 'id',
      header: 'Actions',
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
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="filter-select"
        >
          <option value="">All Roles</option>
          {roleOptions.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          className="filter-select"
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      <div className="content-section">
        {isLoading ? (
          <p className="text-center text-gray-600">Loading...</p>
        ) : (
          <DataTable columns={userColumns} data={users} />
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-panel-md">
            <h3 className="text-lg font-semibold mb-4">
              {editingUser ? 'Edit User' : 'Create User'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  Role *
                </label>
                <select
                  value={userForm.role}
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>

              {userForm.role === 'Vendor' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vendor *
                  </label>
                  <select
                    value={userForm.vendorId}
                    onChange={(e) => setUserForm({ ...userForm, vendorId: e.target.value })}
                    required={userForm.role === 'Vendor'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Select Vendor</option>
                    {vendors.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </option>
                    ))}
                  </select>
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

              <div className="flex gap-3 pt-4">
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
            <h3 className="text-lg font-semibold mb-4">
              Change Password for {editingUser?.email}
            </h3>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
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

              <div className="flex gap-3 pt-4">
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
