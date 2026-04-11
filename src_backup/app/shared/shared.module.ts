import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

@NgModule({
  declarations: [
    // Ajoutez ici les composants partagés
    // Par exemple : ProductCardComponent, LoadingSpinnerComponent, etc.
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule
  ],
  exports: [
    // Exporter pour que les autres modules puissent les utiliser
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule
    // Ajoutez ici vos composants à exporter
  ]
})
export class SharedModule { }
