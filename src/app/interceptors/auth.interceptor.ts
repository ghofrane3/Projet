import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Cloner la requête et ajouter withCredentials
  const clonedReq = req.clone({
    withCredentials: true  // ⭐ Envoie les cookies automatiquement
  });

  return next(clonedReq);
};
