import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './product-form.component.html',
  styleUrls: ['./product-form.component.scss']
})
export class ProductFormComponent implements OnInit {

  // ── État du formulaire ───────────────────
  loading = false;
  success = '';
  errors: string[] = [];

  // ── Données du produit ───────────────────
  product = {
    name: '',
    description: '',
    price: null as number | null,
    originalPrice: null as number | null,
    category: '',
    gender: 'Unisexe',
    stock: null as number | null,
    material: '',
    brand: 'Fashion Store',
    sku: '',
    featured: false,
  };

  // ── Tailles ──────────────────────────────
  availableSizes = {
    'T-shirts': ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
    'Robes':    ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    'Pantalons':['34', '36', '38', '40', '42', '44', '46', '48'],
    'Vestes':   ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    'Pulls':    ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    'Shorts':   ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    'Jupes':    ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    'Manteaux': ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    'Chaussures':['36EU','37EU','38EU','39EU','40EU','41EU','42EU','43EU','44EU','45EU'],
    'Accessoires': []
  } as { [key: string]: string[] };

  selectedSizes: string[] = [];

  // ── Couleurs ─────────────────────────────
  colors: { name: string; hex: string }[] = [];
  newColor = { name: '', hex: '#000000' };

  // ── Tags ─────────────────────────────────
  tags: string[] = [];
  newTag = '';

  // ── Images ───────────────────────────────
  selectedFiles: File[] = [];
  previewUrls: string[] = [];
  dragOver = false;

  // ── Options fixes ─────────────────────────
  categories = ['T-shirts','Robes','Pantalons','Vestes','Pulls','Shorts','Jupes','Manteaux','Accessoires','Chaussures'];
  genders = ['Homme', 'Femme', 'Enfant', 'Unisexe'];

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {}

  // ─────────────────────────────────────────
  // GESTION DES TAILLES
  // ─────────────────────────────────────────
  getSizesForCategory(): string[] {
    return this.availableSizes[this.product.category] || [];
  }

  toggleSize(size: string): void {
    const idx = this.selectedSizes.indexOf(size);
    if (idx > -1) {
      this.selectedSizes.splice(idx, 1);
    } else {
      this.selectedSizes.push(size);
    }
  }

  isSizeSelected(size: string): boolean {
    return this.selectedSizes.includes(size);
  }

  onCategoryChange(): void {
    this.selectedSizes = []; // Réinitialiser les tailles
  }

  // ─────────────────────────────────────────
  // GESTION DES COULEURS
  // ─────────────────────────────────────────
  addColor(): void {
    if (!this.newColor.name.trim()) return;
    this.colors.push({ ...this.newColor });
    this.newColor = { name: '', hex: '#000000' };
  }

  removeColor(index: number): void {
    this.colors.splice(index, 1);
  }

  // ─────────────────────────────────────────
  // GESTION DES TAGS
  // ─────────────────────────────────────────
  addTag(): void {
    const tag = this.newTag.trim().toLowerCase();
    if (tag && !this.tags.includes(tag)) {
      this.tags.push(tag);
      this.newTag = '';
    }
  }

  removeTag(index: number): void {
    this.tags.splice(index, 1);
  }

  onTagKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addTag();
    }
  }

  // ─────────────────────────────────────────
  // GESTION DES IMAGES
  // ─────────────────────────────────────────
  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.addFiles(Array.from(input.files));
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = true;
  }

  onDragLeave(): void {
    this.dragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = false;
    const files = Array.from(event.dataTransfer?.files || []);
    this.addFiles(files);
  }

  private addFiles(files: File[]): void {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    files.forEach(file => {
      if (!allowed.includes(file.type)) {
        this.errors.push(`Format non supporté: ${file.name}. Utilisez JPG, PNG ou WebP`);
        return;
      }
      if (file.size > maxSize) {
        this.errors.push(`Fichier trop volumineux: ${file.name}. Max 5MB`);
        return;
      }
      if (this.selectedFiles.length >= 5) {
        this.errors.push('Maximum 5 images autorisées');
        return;
      }

      this.selectedFiles.push(file);

      // Générer la prévisualisation
      const reader = new FileReader();
      reader.onload = (e) => {
        this.previewUrls.push(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    });
  }

  removeImage(index: number): void {
    this.selectedFiles.splice(index, 1);
    this.previewUrls.splice(index, 1);
  }

  setMainImage(index: number): void {
    // Déplacer l'image en première position (= image principale)
    const file = this.selectedFiles.splice(index, 1)[0];
    const preview = this.previewUrls.splice(index, 1)[0];
    this.selectedFiles.unshift(file);
    this.previewUrls.unshift(preview);
  }

  // ─────────────────────────────────────────
  // SOUMISSION DU FORMULAIRE
  // ─────────────────────────────────────────
  onSubmit(): void {
    this.errors = [];
    this.success = '';

    // ── Validation ──────────────────────────
    if (!this.product.name.trim()) this.errors.push('Le nom est requis');
    if (!this.product.description.trim()) this.errors.push('La description est requise');
    if (!this.product.price || this.product.price <= 0) this.errors.push('Le prix est invalide');
    if (!this.product.category) this.errors.push('La catégorie est requise');
    if (this.product.stock === null || this.product.stock < 0) this.errors.push('Le stock est invalide');
    if (this.selectedFiles.length === 0) this.errors.push('Au moins une image est requise');

    if (this.errors.length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    this.loading = true;

    // ── Construire le FormData ───────────────
    const formData = new FormData();
    formData.append('name', this.product.name.trim());
    formData.append('description', this.product.description.trim());
    formData.append('price', String(this.product.price));
    formData.append('category', this.product.category);
    formData.append('gender', this.product.gender);
    formData.append('stock', String(this.product.stock));
    formData.append('featured', String(this.product.featured));

    if (this.product.originalPrice) {
      formData.append('originalPrice', String(this.product.originalPrice));
    }
    if (this.product.material) formData.append('material', this.product.material);
    if (this.product.brand) formData.append('brand', this.product.brand);
    if (this.product.sku) formData.append('sku', this.product.sku);

    formData.append('sizes', JSON.stringify(this.selectedSizes));
    formData.append('colors', JSON.stringify(this.colors));
    formData.append('tags', JSON.stringify(this.tags));

    // ── Ajouter les images ───────────────────
    this.selectedFiles.forEach(file => {
      formData.append('images', file, file.name);
    });

    // ── Envoyer au backend ───────────────────
    const token = this.authService.getAccessToken();
    const headers = new HttpHeaders({ 'Authorization': `Bearer ${token}` });

    this.http.post('http://localhost:5000/api/admin/products', formData, { headers })
      .subscribe({
        next: (response: any) => {
          this.loading = false;
          this.success = '✅ Produit créé avec succès !';
          console.log('✅ Produit créé:', response.product);
          window.scrollTo({ top: 0, behavior: 'smooth' });

          // Réinitialiser après 2 secondes
          setTimeout(() => {
            this.resetForm();
          }, 2000);
        },
        error: (error) => {
          this.loading = false;
          console.error('❌ Erreur:', error);

          if (error.error?.errors) {
            this.errors = error.error.errors;
          } else {
            this.errors = [error.error?.message || 'Erreur lors de la création'];
          }
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
  }

  // ─────────────────────────────────────────
  // RÉINITIALISATION
  // ─────────────────────────────────────────
  resetForm(): void {
    this.product = {
      name: '', description: '', price: null, originalPrice: null,
      category: '', gender: 'Unisexe', stock: null,
      material: '', brand: 'Fashion Store', sku: '', featured: false
    };
    this.selectedSizes = [];
    this.colors = [];
    this.tags = [];
    this.selectedFiles = [];
    this.previewUrls = [];
    this.errors = [];
    this.success = '';
  }
}
