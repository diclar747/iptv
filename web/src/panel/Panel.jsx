import React from 'react';
import AdminPanel from './AdminPanel.jsx';
import ResellerPanel from './ResellerPanel.jsx';

// El admin gestiona resellers y paquetes; el reseller gestiona sus clientes.
export default function Panel({ user }) {
  if (user.role === 'admin') return <AdminPanel />;
  return <ResellerPanel user={user} />;
}
