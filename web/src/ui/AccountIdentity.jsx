import React, { useState } from 'react';

export function accountName(user) {
  return user.displayName?.trim() || (user.googleAccount ? user.email || 'Cuenta de Google' : user.username);
}

export default function AccountAvatar({ user, className }) {
  const [failedPhoto, setFailedPhoto] = useState(null);
  const photo = user.googlePictureUrl || user.logoUrl;

  return <span className={className} aria-hidden="true">
    {photo && failedPhoto !== photo
      ? <img src={photo} alt="" referrerPolicy="no-referrer" onError={() => setFailedPhoto(photo)} />
      : accountName(user).slice(0, 1).toLocaleUpperCase('es-PY')}
  </span>;
}
