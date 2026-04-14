import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../../services/auth.service';
import { AdminProductService } from '../../../services/admin-product.service';

@Component({
  selector: 'app-product-form',
  templateUrl: './product-form.component.html',
  styleUrls: ['./product-form.component.scss']
})
export class ProductFormComponent implements OnInit {

  // ── Mode (création ou édition) ───────────────────────────
  isEditMode = false;
  productId: string | null = null;
  pageLoading = false;   // chargement initial en mode édition

  // ── État du formulaire ───────────────────────────────────
  loading = false;
  success = '';
  errors: string[] = [];

  // ── Données du produit ───────────────────────────────────
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

  // ── Tailles ──────────────────────────────────────────────
  availableSizes: { [key: string]: string[] } = {
    'T-shirts':   ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
    'Robes':      ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    'Pantalons':  ['34', '36', '38', '40', '42', '44', '46', '48'],
    'Vestes':     ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    'Pulls':      ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    'Shorts':     ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    'Jupes':      ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    'Manteaux':   ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    'Chaussures': ['36EU','37EU','38EU','39EU','40EU','41EU','42EU','43EU','44EU','45EU'],
    'Accessoires':[]
  };

  selectedSizes: string[] = [];

  // ── Couleurs ─────────────────────────────────────────────
  colors: { name: string; hex: string }[] = [];
  newColor = { name: '', hex: '#000000' };

  // ── Tags ─────────────────────────────────────────────────
  tags: string[] = [];
  newTag = '';

  // ── Images ───────────────────────────────────────────────
  selectedFiles: File[] = [];
  previewUrls: string[] = [];
  existingImages: { url: string; publicId: string; isMain: boolean }[] = [];
  dragOver = false;

  // ── Options fixes ─────────────────────────────────────────
  categories = ['T-shirts','Robes','Pantalons','Vestes','Pulls','Shorts',
                 'Jupes','Manteaux','Accessoires','Chaussures'];
  genders = ['Homme', 'Femme', 'Enfant', 'Unisexe'];

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private adminProductService: AdminProductService
  ) {}

  ngOnInit(): void {
    // Détecter le mode édition via le paramètre :id dans l'URL
    this.productId = this.route.snapshot.paramMap.get('id');
    if (this.productId) {
      this.isEditMode = true;
      this.loadProduct(this.productId);
    }
  }

  // ─────────────────────────────────────────
  // CHARGEMENT EN MODE ÉDITION
  // ─────────────────────────────────────────
  loadProduct(id: string): void {
    this.pageLoading = true;

    this.adminProductService.getProductById(id).subscribe({
      next: ({ product }) => {
        // Remplir les champs texte / numériques
        this.product = {
          name:          product.name,
          description:   product.description,
          price:         product.price,
          originalPrice: product.originalPrice ?? null,
          category:      product.category,
          gender:        product.gender,
          stock:         product.stock,
          material:      product.material,
          brand:         product.brand,
          sku:           product.sku ?? '',
          featured:      product.featured,
        };

        this.selectedSizes    = [...(product.sizes || [])];
        this.colors           = product.colors ? product.colors.map(c => ({ ...c })) : [];
        this.tags             = [...(product.tags || [])];
        this.existingImages   = product.images ? [...product.images] : [];
        this.pageLoading      = false;
      },
      error: (err) => {
        this.errors      = ['Impossible de charger le produit : ' + (err.error?.message || err.message)];
        this.pageLoading = false;
      }
    });
  }

  // ─────────────────────────────────────────
  // GESTION DES TAILLES
  // ─────────────────────────────────────────
  getSizesForCategory(): string[] {
    return this.availableSizes[this.product.category] || [];
  }

  toggleSize(size: string): void {
    const idx = this.selectedSizes.indexOf(size);
    if (idx > -1) this.selectedSizes.splice(idx, 1);
    else          this.selectedSizes.push(size);
  }

  isSizeSelected(size: string): boolean {
    return this.selectedSizes.includes(size);
  }

  onCategoryChange(): void {
    this.selectedSizes = [];
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
    if (input.files) this.addFiles(Array.from(input.files));
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = true;
  }

  onDragLeave(): void { this.dragOver = false; }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = false;
    this.addFiles(Array.from(event.dataTransfer?.files || []));
  }

  private addFiles(files: File[]): void {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSize = 5 * 1024 * 1024;

    files.forEach(file => {
      if (!allowed.includes(file.type)) {
        this.errors.push(`Format non supporté : ${file.name}`); return;
      }
      if (file.size > maxSize) {
        this.errors.push(`Fichier trop volumineux : ${file.name} (max 5 MB)`); return;
      }
      const totalImages = this.existingImages.length + this.selectedFiles.length;
      if (totalImages >= 5) {
        this.errors.push('Maximum 5 images autorisées'); return;
      }
      this.selectedFiles.push(file);
      const reader = new FileReader();
      reader.onload = (e) => this.previewUrls.push(e.target?.result as string);
      reader.readAsDataURL(file);
    });
  }

  removeNewImage(index: number): void {
    this.selectedFiles.splice(index, 1);
    this.previewUrls.splice(index, 1);
  }

  removeExistingImage(index: number): void {
    this.existingImages.splice(index, 1);
  }

  setMainNewImage(index: number): void {
    const file    = this.selectedFiles.splice(index, 1)[0];
    const preview = this.previewUrls.splice(index, 1)[0];
    this.selectedFiles.unshift(file);
    this.previewUrls.unshift(preview);
  }

  // ─────────────────────────────────────────
  // SOUMISSION DU FORMULAIRE
  // ─────────────────────────────────────────
  onSubmit(): void {
    this.errors  = [];
    this.success = '';

    // ── Validation ──────────────────────────────────────────
    if (!this.product.name.trim())                            this.errors.push('Le nom est requis');
    if (!this.product.description.trim())                     this.errors.push('La description est requise');
    if (!this.product.price || this.product.price <= 0)       this.errors.push('Le prix est invalide');
    if (!this.product.category)                               this.errors.push('La catégorie est requise');
    if (this.product.stock === null || this.product.stock < 0) this.errors.push('Le stock est invalide');

    // En mode création, au moins une image est obligatoire
    const hasImages = this.existingImages.length + this.selectedFiles.length;
    if (!this.isEditMode && hasImages === 0) this.errors.push('Au moins une image est requise');

    if (this.errors.length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    this.loading = true;

    const formData = new FormData();
    formData.append('name',        this.product.name.trim());
    formData.append('description', this.product.description.trim());
    formData.append('price',       String(this.product.price));
    formData.append('category',    this.product.category);
    formData.append('gender',      this.product.gender);
    formData.append('stock',       String(this.product.stock));
    formData.append('featured',    String(this.product.featured));

    if (this.product.originalPrice)  formData.append('originalPrice', String(this.product.originalPrice));
    if (this.product.material)       formData.append('material',  this.product.material);
    if (this.product.brand)          formData.append('brand',     this.product.brand);
    if (this.product.sku)            formData.append('sku',       this.product.sku);

    formData.append('sizes',  JSON.stringify(this.selectedSizes));
    formData.append('colors', JSON.stringify(this.colors));
    formData.append('tags',   JSON.stringify(this.tags));

    this.selectedFiles.forEach(file => formData.append('images', file, file.name));

    const request$ = this.isEditMode && this.productId
      ? this.adminProductService.updateProduct(this.productId, formData)
      : this.adminProductService.createProduct(formData);

    request$.subscribe({
      next: () => {
        this.loading = false;
        this.success = this.isEditMode
          ? '✅ Produit modifié avec succès !'
          : '✅ Produit créé avec succès !';
        window.scrollTo({ top: 0, behavior: 'smooth' });

        setTimeout(() => {
          this.router.navigate(['/admin/products']);
        }, 1500);
      },
      error: (error) => {
        this.loading = false;
        if (error.error?.errors) this.errors = error.error.errors;
        else this.errors = [error.error?.message || 'Erreur lors de la sauvegarde'];
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
    this.selectedSizes  = [];
    this.colors         = [];
    this.tags           = [];
    this.selectedFiles  = [];
    this.previewUrls    = [];
    this.existingImages = [];
    this.errors         = [];
    this.success        = '';
  }
}
