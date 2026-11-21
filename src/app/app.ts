import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { SchoolSearch } from './school-search/school-search';

@Component({
  imports: [SchoolSearch, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('my-first-app');
  protected readonly isAuthenticated = signal(false);
  protected readonly authLoading = signal(true);
  protected readonly authBusy = signal(false);
  protected readonly userName = signal('');
  protected readonly authError = signal<string | null>(null);

  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      this.isAuthenticated.set(user !== null);
      this.userName.set(user?.displayName || user?.email || 'Tài khoản');
      this.authLoading.set(false);
    });

    this.destroyRef.onDestroy(unsubscribe);
  }

  protected async signInWithGoogle(): Promise<void> {
    this.authError.set(null);
    this.authBusy.set(true);

    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      this.authError.set(error instanceof Error ? error.message : 'Không thể đăng nhập bằng Google.');
    } finally {
      this.authBusy.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    this.authError.set(null);
    this.authBusy.set(true);

    try {
      await signOut(auth);
    } catch (error) {
      this.authError.set(error instanceof Error ? error.message : 'Không thể đăng xuất.');
    } finally {
      this.authBusy.set(false);
    }
  }
}
