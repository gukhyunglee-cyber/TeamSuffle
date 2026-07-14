/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Shuffle,
  Users,
  RotateCcw,
  Sparkles,
  Share2,
  Check,
  Search,
  Trash2,
  RefreshCw,
  Layers,
  Award,
  Crown,
  HelpCircle,
  Plus,
  Download,
  Smartphone,
  Upload,
  Lock,
  Unlock,
  Settings,
  Edit3,
  ExternalLink,
  AlertTriangle,
  Info,
  Copy,
  ChevronDown,
  ChevronUp,
  Menu,
  X,
  Cloud,
  Save,
  Gift,
  Camera
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { motion, AnimatePresence } from 'motion/react';
import { Member, Group, Department, AppUser, ShuffleStyle } from './types';
import { DEFAULT_MEMBERS } from './data/defaultMembers';
import AddMemberForm from './components/AddMemberForm';
import MemberItemCard from './components/MemberItemCard';
import {
  collection,
  onSnapshot,
  setDoc,
  getDoc,
  doc,
  deleteDoc,
  updateDoc,
  writeBatch,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth, loginWithGoogle, loginWithGoogleRedirect, logout, authenticateApp, testConnection, handleFirestoreError, OperationType, safeStorage } from './firebase';

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Helper to wrap Firestore Promises with an absolute timeout limit (15 seconds) to prevent infinite pending locks
function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 15000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('네트워크 응답 시간 초과 (Timeout)'));
    }, timeoutMs);
    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Programmatically downscales large base64 images to safe, compact dimensions (e.g. max 120x120 or 150x150, quality 0.8)
 * to ensure database writes are incredibly fast and never hit payload or timeout limits.
 */
function compressBase64Image(base64Str: string, maxWidth = 120, maxHeight = 120): Promise<string> {
  return new Promise<string>((resolve) => {
    if (!base64Str || !base64Str.startsWith('data:image')) {
      resolve(base64Str);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      try {
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        resolve(compressed);
      } catch (e) {
        resolve(base64Str);
      }
    };
    img.onerror = () => {
      resolve(base64Str);
    };
    img.src = base64Str;
  });
}

export default function App() {
  // Authentication States
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [showLoadingWarning, setShowLoadingWarning] = useState<boolean>(false);

  useEffect(() => {
    if (isAuthLoading) {
      const timer = setTimeout(() => {
        setShowLoadingWarning(true);
      }, 3500);
      return () => clearTimeout(timer);
    } else {
      setShowLoadingWarning(false);
    }
  }, [isAuthLoading]);

  // Departments State
  const [departments, setDepartments] = useState<Department[]>(() => {
    const saved = safeStorage.getItem('dept_departments');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return []; }
    }
    return [];
  });
  
  // Selected department ID
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(() => {
    return safeStorage.getItem('selected_dept_id') || null;
  });

  // Members State
  const [members, setMembers] = useState<Member[]>(() => {
    const saved = safeStorage.getItem('dept_members');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return []; }
    }
    return [];
  });

  // Unlocked department IDs (session-based cache for password authorization)
  const [unlockedDepts, setUnlockedDepts] = useState<string[]>([]);

  // Offline or online states
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(() => {
    return safeStorage.getItem('force_offline_mode') === 'true';
  });
  const [isDbLoading, setIsDbLoading] = useState<boolean>(() => {
    return safeStorage.getItem('force_offline_mode') !== 'true';
  });

  // Track draft unsaved list edits
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const hasUnsavedChangesRef = React.useRef<boolean>(false);
  const deletedMemberIdsRef = React.useRef<string[]>([]);
  const [isSavingToServer, setIsSavingToServer] = useState<boolean>(false);

  const updateHasUnsavedChanges = (val: boolean) => {
    setHasUnsavedChanges(val);
    hasUnsavedChangesRef.current = val;
  };

  // Navigation active steps: 1 = Member setup / 2 = Shuffling & Results / 3 = Users Management (Admin)
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  // Group size controls
  const [groupCount, setGroupCount] = useState<number>(3);
  const [groups, setGroups] = useState<Group[]>([]);
  const [drawType, setDrawType] = useState<'group' | 'lucky'>('group');
  const [luckyDrawCount, setLuckyDrawCount] = useState<number>(1);
  const [luckyDrawWinners, setLuckyDrawWinners] = useState<Member[]>([]);
  const [groupNamingStyle, setGroupNamingStyle] = useState<string>('template_eng');
  const [customGroupNamesStr, setCustomGroupNamesStr] = useState<string>('');
  const [isNamingPanelExpanded, setIsNamingPanelExpanded] = useState<boolean>(false);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  // Department Modals & UI States
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptNameInput, setDeptNameInput] = useState('');
  const [deptPasswordInput, setDeptPasswordInput] = useState('');

  // Password Verification Dialog States
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordTargetDeptId, setPasswordTargetDeptId] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordSuccessCallback, setPasswordSuccessCallback] = useState<(() => void) | null>(null);
  const [passwordErrorMsg, setPasswordErrorMsg] = useState('');

  // PWA (Progressive Web App) states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBadge, setShowInstallBadge] = useState<boolean>(true);
  const [isInstallGuideOpen, setIsInstallGuideOpen] = useState(false);

  // Shuffling states
  const [isShuffling, setIsShuffling] = useState(false);
  const [shufflePhase, setShufflePhase] = useState<'idle' | 'preparing' | 'scrambling' | 'positioning' | 'completed'>('idle');
  const [activeShuffleMember, setActiveShuffleMember] = useState<Member | null>(null);
  const [selectedShuffleStyle, setSelectedShuffleStyle] = useState<ShuffleStyle>(() => {
    const saved = safeStorage.getItem('preferred_shuffle_style');
    return (saved as ShuffleStyle) || ShuffleStyle.ROULETTE;
  });
  const [activeShuffleStyle, setActiveShuffleStyle] = useState<ShuffleStyle>(ShuffleStyle.ROULETTE);
  const [slotMachineReels, setSlotMachineReels] = useState<Member[][]>([]);
  const [vortexMiniMembers, setVortexMiniMembers] = useState<Member[]>([]);
  const [copied, setCopied] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [rulesCopied, setRulesCopied] = useState(false);

  // Robust clipboard copy supporting standard and sandboxed environments (iframes/mobile)
  const copyToClipboard = (text: string, onSuccess: () => void) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(() => {
            onSuccess();
          })
          .catch((err) => {
            console.warn('navigator.clipboard failed, attempting fallback:', err);
            fallbackCopy(text, onSuccess);
          });
      } else {
        fallbackCopy(text, onSuccess);
      }
    } catch (e) {
      console.warn('copyToClipboard error, attempting fallback:', e);
      fallbackCopy(text, onSuccess);
    }
  };

  const fallbackCopy = (text: string, onSuccess: () => void) => {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.top = "0";
      textarea.style.left = "0";
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, 99999); // For mobile devices
      const successful = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (successful) {
        onSuccess();
      } else {
        console.warn("Fallback copy execution command is unsuccessful");
      }
    } catch (err) {
      console.error("Fallback copy execution threw error:", err);
    }
  };

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBadge(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const afterInstallHandler = () => {
      console.log('TeamShuffle has been successfully installed!');
      setDeferredPrompt(null);
      setShowInstallBadge(false);
    };
    window.addEventListener('appinstalled', afterInstallHandler);

    if (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone) {
      setShowInstallBadge(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', afterInstallHandler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      setDeferredPrompt(null);
      setShowInstallBadge(false);
    } else {
      setIsInstallGuideOpen(true);
    }
  };

  // Helper to test structural authorization before doing mutation
  const checkPasswordAuth = (deptId: string, action: () => void) => {
    // If already unlocked in session, proceed immediately
    if (unlockedDepts.includes(deptId)) {
      action();
      return;
    }

    // Find plain Department
    const dept = departments.find(d => d.id === deptId);
    if (!dept) {
      alert('존재하지 않는 부서입니다.');
      return;
    }

    // Trigger auth password modal
    setPasswordTargetDeptId(deptId);
    setPasswordInput('');
    setPasswordErrorMsg('');
    setPasswordSuccessCallback(() => () => {
      action();
    });
    setIsPasswordModalOpen(true);
  };

  // Submit password input for authorization
  const handleVerifyPassword = () => {
    if (!passwordTargetDeptId) return;
    const dept = departments.find(d => d.id === passwordTargetDeptId);
    if (!dept) return;

    if (dept.password === passwordInput) {
      // Success
      setUnlockedDepts(prev => [...prev, passwordTargetDeptId]);
      setIsPasswordModalOpen(false);
      if (passwordSuccessCallback) {
        passwordSuccessCallback();
      }
    } else {
      setPasswordErrorMsg('비밀번호가 일치하지 않습니다. 부서 생성 시 설정한 권한 비밀번호를 다시 확인하세요.');
    }
  };

  const enableOfflineMode = () => {
    safeStorage.setItem('force_offline_mode', 'true');
    setIsOfflineMode(true);
    setCurrentUser({ uid: 'offline', email: 'offline@teamshuffle.local' });
    setAppUser({
      uid: 'offline-user',
      email: 'offline@teamshuffle.local',
      displayName: '오프라인 관리자',
      photoUrl: '',
      approved: true,
      role: 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    setIsAuthLoading(false);
  };

  // Monitor auth state changes
  useEffect(() => {
    if (safeStorage.getItem('force_offline_mode') === 'true') {
      setCurrentUser({ uid: 'offline', email: 'offline@teamshuffle.local' });
      setAppUser({
        uid: 'offline-user',
        email: 'offline@teamshuffle.local',
        displayName: '오프라인 관리자',
        photoUrl: '',
        approved: true,
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setIsAuthLoading(false);
      return;
    }

    let unsubUserSnap: (() => void) | null = null;
    let unsubscribe: (() => void) | null = null;

    // Safety timeout to prevent getting stuck on loading screen if Firebase Auth hangs
    const authTimeout = setTimeout(() => {
      console.warn('Firebase connection / initialization is taking longer than usual.');
      setIsAuthLoading(false);
    }, 8000);

    try {
      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        // Clean up previous snapshots
        if (unsubUserSnap) {
          unsubUserSnap();
          unsubUserSnap = null;
        }

        if (firebaseUser) {
          setCurrentUser(firebaseUser);
          
          let initCompleted = false;
          // Sub-timer to prevent firestore hang from freezing the loading UI
          const fetchTimeout = setTimeout(() => {
            if (!initCompleted) {
              console.warn('Firestore user fetch taking longer than usual. Force un-sticking loading screen.');
              setIsAuthLoading(false);
            }
          }, 7000);
          
          try {
            const getDocWithRetry = async (docRef: any, maxRetries = 3, delayMs = 1500) => {
              let lastErr: any;
              for (let i = 0; i < maxRetries; i++) {
                try {
                  const docPromise = getDoc(docRef);
                  const timeoutPromise = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Failed to get document because the client is offline (timeout)')), 3500)
                  );
                  return await Promise.race([docPromise, timeoutPromise]);
                } catch (err: any) {
                  lastErr = err;
                  const errMsg = err?.message || String(err);
                  if (
                    errMsg.includes('offline') ||
                    errMsg.toLowerCase().includes('failed to get document') ||
                    errMsg.toLowerCase().includes('client is offline') ||
                    errMsg.toLowerCase().includes('network') ||
                    errMsg.toLowerCase().includes('timeout')
                  ) {
                    console.warn(`Firestore getDoc failed (attempt ${i + 1}/${maxRetries}). Retrying in ${delayMs}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    continue;
                  }
                  throw err;
                }
              }
              throw lastErr;
            };

            const userDocRef = doc(db, 'users', firebaseUser.uid);
            const userSnap = await getDocWithRetry(userDocRef);
            
            let fetchedUser: AppUser;
            if (!userSnap.exists()) {
              const now = new Date().toISOString();
              const emailLower = (firebaseUser.email || '').toLowerCase();
              const isSuperAdminEmail = emailLower === 'gukhyunglee@gmail.com';
              
              fetchedUser = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || '사용자',
                photoUrl: firebaseUser.photoURL || '',
                approved: isSuperAdminEmail,
                role: isSuperAdminEmail ? 'admin' : 'user',
                createdAt: now,
                updatedAt: now
              };
              await setDoc(userDocRef, fetchedUser);
            } else {
              fetchedUser = userSnap.data() as AppUser;
            }

            // Force dynamic Super Admin tier upgrade if the user is gukhyunglee@gmail.com
            const emailLower = (firebaseUser.email || '').toLowerCase();
            if (emailLower === 'gukhyunglee@gmail.com') {
              if (fetchedUser.role !== 'admin' || !fetchedUser.approved) {
                fetchedUser.role = 'admin';
                fetchedUser.approved = true;
                await setDoc(userDocRef, fetchedUser, { merge: true });
              }
            }

            setAppUser(fetchedUser);
            setAuthError(null); // Clear previous errors if successful
          } catch (err: any) {
            console.error('Error fetching/creating user profile:', err);
            let errMsg = err?.message || String(err);
            if (errMsg.includes('permission') || errMsg.includes('Permission') || errMsg.includes('PERMISSION_DENIED') || errMsg.includes('insufficient')) {
              setAuthError('Firestore 연동 실패: 데이터베이스 권한이 부족합니다. Firebase Console의 [Firestore Database] > [Rules] 탭에 적절한 보안 규칙이 설정되어 있는지 확인하세요.');
            } else if (errMsg.includes('timeout') || errMsg.includes('offline')) {
              setAuthError('Firestore 연결 타임아웃: 데이터베이스를 찾을 수 없거나 연결할 수 없습니다. Firebase Console에서 [Firestore Database]가 실제로 "Create(생성)" 되었는지 확인해주세요.');
            } else {
              setAuthError(`사용자 정보를 데이터베이스에서 불러오지 못했습니다: ${errMsg}`);
            }
            setIsAuthLoading(false);
            return;
          }

          // Set up snapshot observer to listen for real-time manager approval
          try {
            const userDocRef = doc(db, 'users', firebaseUser.uid);
            unsubUserSnap = onSnapshot(userDocRef, (docSnap) => {
              if (docSnap.exists()) {
                const updatedUser = docSnap.data() as AppUser;
                const emailLower = (firebaseUser.email || '').toLowerCase();
                if (emailLower === 'gukhyunglee@gmail.com') {
                  updatedUser.role = 'admin';
                  updatedUser.approved = true;
                }
                setAppUser(updatedUser);
              }
            }, (err: any) => {
              console.error('User snapshot error:', err);
              let errMsg = err?.message || String(err);
              if (errMsg.includes('permission') || errMsg.includes('Permission') || errMsg.includes('PERMISSION_DENIED') || errMsg.includes('insufficient')) {
                setAuthError('Firestore 실시간 갱신 권한 오류가 발생했습니다. 개인 Firebase 설정의 [Rules]에 보안 규칙이 배포되어 있어야 합니다.');
              }
            });
          } catch (snapshotErr) {
            console.error('Failed to set up user snapshot observer:', snapshotErr);
          }

          initCompleted = true;
          clearTimeout(fetchTimeout);
          clearTimeout(authTimeout);
          setIsAuthLoading(false);
        } else {
          setCurrentUser(null);
          setAppUser(null);
          clearTimeout(authTimeout);
          setIsAuthLoading(false);
        }
      });
    } catch (authInitErr: any) {
      console.error('onAuthStateChanged registration failed:', authInitErr);
      clearTimeout(authTimeout);
      setIsAuthLoading(false);
      setAuthError(`Firebase Auth 초기화 오류: ${authInitErr?.message || authInitErr}`);
    }

    return () => {
      clearTimeout(authTimeout);
      if (unsubscribe) {
        unsubscribe();
      }
      if (unsubUserSnap) {
        unsubUserSnap();
      }
    };
  }, [isOfflineMode]);

  // Subscribe to all users if current user is an admin
  useEffect(() => {
    if (!appUser || appUser.role !== 'admin') {
      setUsers([]);
      return;
    }

    const usersRef = collection(db, 'users');
    const unsubscribe = onSnapshot(usersRef, (snap) => {
      const loadedUsers: AppUser[] = [];
      snap.forEach((docSnap) => {
        loadedUsers.push(docSnap.data() as AppUser);
      });
      const sortedUsers = loadedUsers.sort((a, b) => {
        if (a.role === 'admin' && b.role !== 'admin') return -1;
        if (a.role !== 'admin' && b.role === 'admin') return 1;
        if (a.approved && !b.approved) return 1;
        if (!a.approved && b.approved) return -1;
        return a.displayName.localeCompare(b.displayName);
      });
      setUsers(sortedUsers);
    }, (err) => {
      console.error('Error fetching users:', err);
    });

    return () => unsubscribe();
  }, [appUser]);

  // Handle auth actions
  const handleGoogleLogin = async () => {
    try {
      setAuthError(null);
      setIsAuthLoading(true); // Indent load feedback immediately
      // Synchronous popup trigger from user-gesture click context
      await loginWithGoogle();
    } catch (err: any) {
      console.error('Google Sign-In Error:', err);
      let errMsg = err?.message || String(err);
      
      // Categorize and provide friendly instructions in Korean
      if (err?.code === 'auth/popup-blocked') {
        errMsg = '브라우저에서 팝업이 차단되었습니다. 주소창 우측 또는 브라우저 설정을 통해 팝업창 허용을 승인해주시기 바랍니다.';
      } else if (err?.code === 'auth/unauthorized-domain' || errMsg?.includes('unauthorized-domain') || errMsg?.includes('unauthorized_domain') || errMsg?.includes('identity-services/web/unauthorized-domain')) {
        errMsg = 'Firebase 인증 승인 도메인(Authorized Domain) 설정이 완료되지 않았습니다. 관리자 계정으로 [Firebase Console > Authentication > Settings > Authorized domains]에 현재 도메인을 추가해야 합니다.';
      } else if (errMsg?.includes('iframe') || errMsg?.includes('cookie') || errMsg?.includes('cross-origin') || errMsg?.includes('network-request-failed') || errMsg?.includes('storage') || errMsg?.includes('partitioned')) {
        errMsg = '브라우저의 iframe 보안 정책으로 인해 로그인이 실패했습니다. 위 🔔 알림의 [새 창에서 실행하기] 버튼을 통해 독립된 새 탭에서 열어주세요.';
      } else {
        errMsg = `로그인 중 오류가 발생했습니다: ${errMsg}`;
      }
      
      setAuthError(errMsg);
      setIsAuthLoading(false);
    }
  };

  const handleGoogleRedirectLogin = async () => {
    try {
      setAuthError(null);
      setIsAuthLoading(true);
      await loginWithGoogleRedirect();
    } catch (err: any) {
      console.error('Google Redirect Sign-In Error:', err);
      let errMsg = err?.message || String(err);
      setAuthError(`리다이렉트 로그인 실패: ${errMsg}`);
      setIsAuthLoading(false);
    }
  };

  const handleLogoutAction = async () => {
    try {
      safeStorage.removeItem('force_offline_mode');
      setIsOfflineMode(false);
      setIsDbLoading(true);
      await logout();
      setCurrentUser(null);
      setAppUser(null);
      
      // Force whole-page soft reload to purge and reset all in-memory React and listener states
      window.location.reload();
    } catch (err) {
      console.error('Sign out error:', err);
      // Fallback state clearing in case Firebase signOut throws due to network or config errors
      setCurrentUser(null);
      setAppUser(null);
      window.location.reload();
    }
  };

  // Admin user approval actions
  const handleToggleApproval = async (targetUser: AppUser) => {
    if (targetUser.uid === appUser?.uid) {
      alert('본인의 승인 상태는 수정할 수 없습니다.');
      return;
    }
    const userRef = doc(db, 'users', targetUser.uid);
    try {
      await updateDoc(userRef, {
        approved: !targetUser.approved,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      alert('승인 상태 변경에 실패했습니다: ' + err);
    }
  };

  const handleToggleRole = async (targetUser: AppUser) => {
    if (targetUser.uid === appUser?.uid) {
      alert('본인의 권한은 변경할 수 없습니다.');
      return;
    }
    const userRef = doc(db, 'users', targetUser.uid);
    const newRole = targetUser.role === 'admin' ? 'user' : 'admin';
    try {
      await updateDoc(userRef, {
        role: newRole,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      alert('권한 변경에 실패했습니다: ' + err);
    }
  };

  const handleDeleteUser = async (targetUserId: string) => {
    if (targetUserId === appUser?.uid) {
      alert('본인 계정은 삭제할 수 없습니다.');
      return;
    }
    if (!window.confirm('정말로 이 사용자를 삭제하시겠습니까? 등록된 사용자 프로필 기록이 완전히 제거됩니다.')) {
      return;
    }
    const userRef = doc(db, 'users', targetUserId);
    try {
      await deleteDoc(userRef);
    } catch (err) {
      alert('사용자 삭제에 실패했습니다: ' + err);
    }
  };

  // Sync state variables with active changes
  useEffect(() => {
    if (selectedDeptId) {
      safeStorage.setItem('selected_dept_id', selectedDeptId);
    } else {
      safeStorage.removeItem('selected_dept_id');
    }
  }, [selectedDeptId]);

  // Real-time Cloud Synchronization of Departments & Members
  useEffect(() => {
    if (!appUser || !appUser.approved) {
      setIsDbLoading(false);
      return;
    }

    if (safeStorage.getItem('force_offline_mode') === 'true') {
      setIsOfflineMode(true);
      setIsDbLoading(false);
      return;
    }

    let unsubscribeDepts: (() => void) | null = null;
    let unsubscribeMembers: (() => void) | null = null;
    let syncDone = false;
    let syncTimeout: NodeJS.Timeout | null = null;

    function fallbackToOffline(reason: any) {
      if (syncDone) return;
      console.warn('Real-time sync failed. Falling back to local cache mode:', reason);
      setIsOfflineMode(true);
      
      const savedDepts = safeStorage.getItem('dept_departments');
      if (savedDepts) {
        try { setDepartments(JSON.parse(savedDepts)); } catch (e) { setDepartments([]); }
      }
      const savedMembers = safeStorage.getItem('dept_members');
      if (savedMembers) {
        try { setMembers(JSON.parse(savedMembers)); } catch (e) { setMembers([]); }
      }
      setIsDbLoading(false);
    }

    async function initializeSync() {
      syncTimeout = setTimeout(() => {
        if (!syncDone) {
          console.warn('Sync timed out. Switching to offline backup.');
          if (unsubscribeDepts) { unsubscribeDepts(); unsubscribeDepts = null; }
          if (unsubscribeMembers) { unsubscribeMembers(); unsubscribeMembers = null; }
          fallbackToOffline('Firestore responsive timeout (3.5s)');
        }
      }, 3500);

      try {
        await authenticateApp();

        const deptsRef = collection(db, 'departments');
        const membersRef = collection(db, 'members');

        // 1. Snapshot for Departments
        unsubscribeDepts = onSnapshot(deptsRef, async (deptSnap) => {
          syncDone = true;
          if (syncTimeout) {
            clearTimeout(syncTimeout);
            syncTimeout = null;
          }
          setIsOfflineMode(false);
          setIsDbLoading(false);

          if (deptSnap.empty) {
            // Seed default departments & members
            console.log('Seed-checking: Firestore empty. Starting default seeding...');
            const batch = writeBatch(db);

            const deptTechId = 'dept-tech';
            const deptStrategyId = 'dept-strategy';

            const isoNow = new Date().toISOString();

            // Seed departments
            batch.set(doc(db, 'departments', deptTechId), {
              name: '기술 연구소',
              password: '1234',
              createdAt: isoNow,
              updatedAt: isoNow
            });

            batch.set(doc(db, 'departments', deptStrategyId), {
              name: '전략 기획본부',
              password: '1234',
              createdAt: isoNow,
              updatedAt: isoNow
            });

            // Seed mapped members
            DEFAULT_MEMBERS.forEach((m, idx) => {
              // Dev-tech allocation vs Strategy allocation
              const isTech = ['m1', 'm3', 'm5', 'm7', 'm11'].includes(m.id);
              const targetDeptId = isTech ? deptTechId : deptStrategyId;
              const mIso = new Date(Date.now() - idx * 1000).toISOString();

              batch.set(doc(db, 'members', m.id), {
                departmentId: targetDeptId,
                name: m.name,
                role: m.role || '부서원',
                photoUrl: m.photoUrl,
                selected: true,
                createdAt: mIso,
                updatedAt: mIso
              });
            });

            try {
              await withTimeout(batch.commit());
            } catch (err) {
              console.warn('Seeding failed:', err);
              fallbackToOffline(err);
            }
            return;
          }

          // Load Departments
          const loadedDepts: Department[] = [];
          deptSnap.forEach((docSnap) => {
            const data = docSnap.data();
            loadedDepts.push({
              id: docSnap.id,
              name: data.name || '',
              password: data.password || '1234',
              createdAt: data.createdAt || new Date().toISOString(),
              updatedAt: data.updatedAt || new Date().toISOString()
            });
          });

          // Sort by createdAt
          const sortedDepts = loadedDepts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          setDepartments(sortedDepts);

          // If no active department selected, default select the first one
          if (sortedDepts.length > 0 && !selectedDeptId) {
            setSelectedDeptId(sortedDepts[0].id);
          }
        }, (err) => {
          console.warn('Departments subscription blocked:', err);
          fallbackToOffline(err);
        });

        // 2. Snapshot for Members
        unsubscribeMembers = onSnapshot(membersRef, (memberSnap) => {
          if (hasUnsavedChangesRef.current) {
            console.log('Skipping member snapshot update to prevent overwriting unsaved local roster edits.');
            return;
          }
          const loadedMembers: Member[] = [];
          memberSnap.forEach((docSnap) => {
            const data = docSnap.data();
            loadedMembers.push({
              id: docSnap.id,
              departmentId: data.departmentId || '',
              name: data.name || '',
              role: data.role || '부서원',
              photoUrl: data.photoUrl || '',
              selected: data.selected !== false,
              createdAt: data.createdAt || new Date().toISOString(),
              updatedAt: data.updatedAt || new Date().toISOString()
            });
          });

          const sortedMembers = loadedMembers.sort((a, b) => {
            const dateA = a.createdAt || '';
            const dateB = b.createdAt || '';
            return dateB.localeCompare(dateA);
          });

          setMembers(sortedMembers);
        }, (err) => {
          console.warn('Members subscription blocked:', err);
        });

      } catch (err) {
        if (syncTimeout) { clearTimeout(syncTimeout); syncTimeout = null; }
        console.error('Failed to init sync:', err);
        fallbackToOffline(err);
      }
    }

    initializeSync();

    return () => {
      if (unsubscribeDepts) unsubscribeDepts();
      if (unsubscribeMembers) unsubscribeMembers();
    };
  }, [selectedDeptId, appUser]);

  // Seed local storage with default if absolutely empty in offline mode
  useEffect(() => {
    if (isOfflineMode && departments.length === 0) {
      const deptTechId = 'dept-tech';
      const deptStrategyId = 'dept-strategy';
      const isoNow = new Date().toISOString();

      const demoDepts: Department[] = [
        { id: deptTechId, name: '기술 연구소', password: '1234', createdAt: isoNow, updatedAt: isoNow },
        { id: deptStrategyId, name: '전략 기획본부', password: '1234', createdAt: isoNow, updatedAt: isoNow }
      ];

      const demoMembers: Member[] = DEFAULT_MEMBERS.map((m, idx) => {
        const isTech = ['m1', 'm3', 'm5', 'm7', 'm11'].includes(m.id);
        const targetDeptId = isTech ? deptTechId : deptStrategyId;
        const mIso = new Date(Date.now() - idx * 1000).toISOString();
        return {
          ...m,
          departmentId: targetDeptId,
          selected: true,
          createdAt: mIso,
          updatedAt: mIso
        };
      });

      setDepartments(demoDepts);
      setMembers(demoMembers);
      setSelectedDeptId(deptTechId);
    }
  }, [isOfflineMode]);

  // Sync to localStorage
  useEffect(() => {
    if (departments.length > 0) {
      safeStorage.setItem('dept_departments', JSON.stringify(departments));
    }
    if (members.length > 0) {
      safeStorage.setItem('dept_members', JSON.stringify(members));
    }
  }, [departments, members]);

  // Read filtered members belonging to active selected department
  const filteredMembers = useMemo(() => {
    if (!selectedDeptId) return [];
    return members.filter(m => m.departmentId === selectedDeptId);
  }, [members, selectedDeptId]);

  // Adjust group count boundary if active members change
  useEffect(() => {
    const activeSelectedCount = filteredMembers.filter(m => m.selected !== false).length;
    if (groupCount > Math.max(1, activeSelectedCount)) {
      setGroupCount(Math.max(1, activeSelectedCount));
    }
  }, [filteredMembers, groupCount]);

  // Add Department (Local & Global)
  const handleCreateDepartment = async () => {
    if (!deptNameInput.trim()) return;
    const passwordRaw = deptPasswordInput.trim() || '1234';

    const newId = `dept-${Date.now()}`;
    const isoNow = new Date().toISOString();

    const newDept: Department = {
      id: newId,
      name: deptNameInput.trim(),
      password: passwordRaw,
      createdAt: isoNow,
      updatedAt: isoNow
    };

    if (isOfflineMode) {
      setDepartments(prev => [...prev, newDept]);
      setSelectedDeptId(newId);
      // Auto unlock newly created dept
      setUnlockedDepts(prev => [...prev, newId]);
      setIsDeptModalOpen(false);
      setDeptNameInput('');
      setDeptPasswordInput('');
      return;
    }

    try {
      await withTimeout(setDoc(doc(db, 'departments', newId), {
        name: newDept.name,
        password: newDept.password,
        createdAt: isoNow,
        updatedAt: isoNow
      }));
      setUnlockedDepts(prev => [...prev, newId]);
      setSelectedDeptId(newId);
      setIsDeptModalOpen(false);
      setDeptNameInput('');
      setDeptPasswordInput('');
    } catch (err) {
      console.warn('Firestore create dept failed. Cache mode active:', err);
      setIsOfflineMode(true);
      setDepartments(prev => [...prev, newDept]);
      setSelectedDeptId(newId);
      setUnlockedDepts(prev => [...prev, newId]);
      setIsDeptModalOpen(false);
      setDeptNameInput('');
      setDeptPasswordInput('');
    }
  };

  // Edit Department Info (Requires validation)
  const handleUpdateDepartment = async () => {
    if (!editingDept || !deptNameInput.trim()) return;
    const passwordRaw = deptPasswordInput.trim() || editingDept.password || '1234';

    const targetId = editingDept.id;
    const isoNow = new Date().toISOString();

    const action = async () => {
      if (isOfflineMode) {
        setDepartments(prev => prev.map(d => d.id === targetId ? { ...d, name: deptNameInput.trim(), password: passwordRaw, updatedAt: isoNow } : d));
        setIsDeptModalOpen(false);
        setEditingDept(null);
        setDeptNameInput('');
        setDeptPasswordInput('');
        return;
      }

      try {
        await withTimeout(updateDoc(doc(db, 'departments', targetId), {
          name: deptNameInput.trim(),
          password: passwordRaw,
          updatedAt: isoNow
        }));
        setIsDeptModalOpen(false);
        setEditingDept(null);
        setDeptNameInput('');
        setDeptPasswordInput('');
      } catch (err) {
        console.warn('Firestore update dept failed:', err);
        setIsOfflineMode(true);
        setDepartments(prev => prev.map(d => d.id === targetId ? { ...d, name: deptNameInput.trim(), password: passwordRaw, updatedAt: isoNow } : d));
        setIsDeptModalOpen(false);
        setEditingDept(null);
        setDeptNameInput('');
        setDeptPasswordInput('');
      }
    };

    checkPasswordAuth(targetId, action);
  };

  // Delete Department and all nested members
  const handleDeleteDepartment = async (deptId: string) => {
    if (departments.length <= 1) {
      alert('최소 1개 이상의 부서가 존재해야 합니다.');
      return;
    }

    if (!window.confirm('이 부서와 부서에 속한 모든 팀원 데이터가 영구 삭제됩니다. 정말 삭제하시겠습니까?')) {
      return;
    }

    const action = async () => {
      // Find dynamic next selector department
      const remaining = departments.filter(d => d.id !== deptId);
      const nextDeptId = remaining[0]?.id || null;

      if (isOfflineMode) {
        setDepartments(prev => prev.filter(d => d.id !== deptId));
        setMembers(prev => prev.filter(m => m.departmentId !== deptId));
        setSelectedDeptId(nextDeptId);
        return;
      }

      try {
        const batch = writeBatch(db);
        // Delete department
        batch.delete(doc(db, 'departments', deptId));
        // Delete orphaned members
        members.filter(m => m.departmentId === deptId).forEach(m => {
          batch.delete(doc(db, 'members', m.id));
        });

        await withTimeout(batch.commit());
        setSelectedDeptId(nextDeptId);
      } catch (err) {
        console.warn('Firestore delete dept failed:', err);
        setIsOfflineMode(true);
        setDepartments(prev => prev.filter(d => d.id !== deptId));
        setMembers(prev => prev.filter(m => m.departmentId !== deptId));
        setSelectedDeptId(nextDeptId);
      }
    };

    checkPasswordAuth(deptId, action);
  };

  // Toggle Single Member Selected state (No Password Lock out needed for plain selecting to participate in Shuffle)
  const handleToggleSelect = async (id: string) => {
    const target = members.find((m) => m.id === id);
    if (!target) return;

    setMembers((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, selected: m.selected === false, updatedAt: new Date().toISOString() } : m
      )
    );
    updateHasUnsavedChanges(true);
  };

  // Bulk Select / Deselect All for active department
  const handleToggleAll = async (select: boolean) => {
    if (!selectedDeptId) return;

    setMembers((prev) =>
      prev.map((m) =>
        m.departmentId === selectedDeptId ? { ...m, selected: select, updatedAt: new Date().toISOString() } : m
      )
    );
    updateHasUnsavedChanges(true);
  };

  // Add Member to selected department (Requires password verification check first)
  const handleAddMember = async (newMeta: Omit<Member, 'id'>) => {
    if (!selectedDeptId) {
      alert('등록할 부서를 먼저 신설하거나 선택하세요.');
      return;
    }

    const action = async () => {
      const docId = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const isoNow = new Date().toISOString();

      const newMember: Member = {
        ...newMeta,
        id: docId,
        departmentId: selectedDeptId,
        selected: true,
        createdAt: isoNow,
        updatedAt: isoNow,
      };
      setMembers((prev) => [newMember, ...prev]);
      setIsAddMemberModalOpen(false);
      updateHasUnsavedChanges(true);
    };

    checkPasswordAuth(selectedDeptId, action);
  };

  // Add Multiple Members at once (Requires password verification check first)
  const handleAddMembers = async (metaList: Omit<Member, 'id'>[]) => {
    if (!selectedDeptId) {
      alert('등록할 부서를 먼저 신설하거나 선택하세요.');
      return;
    }
    if (metaList.length === 0) return;

    const action = async () => {
      const isoNow = new Date().toISOString();
      const newMembers: Member[] = metaList.map((meta, idx) => ({
        ...meta,
        id: `custom-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
        departmentId: selectedDeptId,
        selected: true,
        createdAt: isoNow,
        updatedAt: isoNow,
      }));
      setMembers((prev) => [...newMembers, ...prev]);
      setIsAddMemberModalOpen(false);
      updateHasUnsavedChanges(true);
    };

    checkPasswordAuth(selectedDeptId, action);
  };

  // Delete Member (Requires password verification check first)
  const handleDeleteMember = async (id: string) => {
    if (!selectedDeptId) return;

    const action = async () => {
      if (!deletedMemberIdsRef.current.includes(id)) {
        deletedMemberIdsRef.current.push(id);
      }
      setMembers((prev) => prev.filter((m) => m.id !== id));
      updateHasUnsavedChanges(true);
    };

    checkPasswordAuth(selectedDeptId, action);
  };

  // Update Member (Requires password verification check first)
  const handleUpdateMember = async (id: string, updated: Omit<Member, 'id' | 'selected'>) => {
    if (!selectedDeptId) return;

    const action = async () => {
      setMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...updated, updatedAt: new Date().toISOString() } : m))
      );
      setIsAddMemberModalOpen(false);
      updateHasUnsavedChanges(true);
    };

    checkPasswordAuth(selectedDeptId, action);
  };

  // Reset to default roster list in active department (Requires password verification cheek)
  const handleResetToDefault = async () => {
    if (!selectedDeptId) return;

    const action = async () => {
      if (!window.confirm('현재 부서원 명단이 기본 명단으로 덮어써집니다. 계속하시겠습니까?')) {
        return;
      }

      // Record existing members of this department for server deletion
      filteredMembers.forEach((m) => {
        if (!deletedMemberIdsRef.current.includes(m.id)) {
          deletedMemberIdsRef.current.push(m.id);
        }
      });

      // Prepare dev team vs strategy team default mapping
      const baseMembers = DEFAULT_MEMBERS.filter(m => {
        const isTech = ['m1', 'm3', 'm5', 'm7', 'm11'].includes(m.id);
        const isTargetTech = selectedDeptId === 'dept-tech';
        return isTech === isTargetTech;
      });

      const resetData = baseMembers.map((m, idx) => ({
        ...m,
        departmentId: selectedDeptId,
        selected: true,
        createdAt: new Date(Date.now() - idx * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      setMembers(prev => [
        ...prev.filter(m => m.departmentId !== selectedDeptId),
        ...resetData
      ]);
      setGroups([]);
      updateHasUnsavedChanges(true);
      alert('현재 부서원 명단을 기본 데모 목록으로 초기화했습니다. (변경 사항을 전체 보존하려면 화면 상단 또는 툴바의 [서버에 저장] 버튼을 눌러주세요.)');
    };

    checkPasswordAuth(selectedDeptId, action);
  };

  // Clear all members in active department (Requires password verification cheek)
  const handleClearAll = async () => {
    if (!selectedDeptId) return;

    const action = async () => {
      if (!window.confirm('현재 부서의 모든 부서원이 영구적으로 삭제됩니다. 정말 삭제하시겠습니까?')) {
        return;
      }

      // Record existing members of this department for server deletion
      filteredMembers.forEach((m) => {
        if (!deletedMemberIdsRef.current.includes(m.id)) {
          deletedMemberIdsRef.current.push(m.id);
        }
      });

      setMembers((prev) => prev.filter((m) => m.departmentId !== selectedDeptId));
      setGroups([]);
      updateHasUnsavedChanges(true);
      alert('현재 부서의 명단을 모두 비웠습니다. (변경 사항을 보존하려면 하단 툴바의 [서버에 저장] 버튼을 눌러주세요.)');
    };

    checkPasswordAuth(selectedDeptId, action);
  };

  // Export current active department list
  const handleExportBackup = () => {
    if (filteredMembers.length === 0) {
      alert('내보낼 부서원 데이터가 없습니다.');
      return;
    }
    try {
      const dataStr = JSON.stringify(filteredMembers, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const deptName = departments.find(d => d.id === selectedDeptId)?.name || 'department';
      link.download = `teamshuffle_${deptName}_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('백업 파일 내보내기에 실패했습니다.');
    }
  };

  // Import backup list into active selected department (Requires password verification cheek)
  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedDeptId) return;

    const action = async () => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const result = event.target?.result as string;
          const parsed = JSON.parse(result);
          if (Array.isArray(parsed)) {
            const isValid = parsed.every(p => typeof p === 'object' && p !== null && 'name' in p);
            if (isValid) {
              // Asynchronously compress any large base64 images in imported JSON before adding them to state
              const updatedList = await Promise.all(
                parsed.map(async (m, idx) => {
                  let finalPhoto = m.photoUrl || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=faces&q=80';
                  if (finalPhoto.startsWith('data:image')) {
                    try {
                      finalPhoto = await compressBase64Image(finalPhoto, 120, 120);
                    } catch (err) {
                      console.warn('Image compression failed during backup restoration:', err);
                    }
                  }
                  return {
                    ...m,
                    id: m.id || `custom-${selectedDeptId}-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
                    departmentId: selectedDeptId,
                    selected: m.selected !== false,
                    role: m.role || '부서원',
                    photoUrl: finalPhoto,
                    createdAt: m.createdAt || new Date(Date.now() - idx * 1000).toISOString(),
                    updatedAt: new Date().toISOString(),
                  };
                })
              );

              // Record existing members of this department for server deletion
              filteredMembers.forEach((m) => {
                if (!deletedMemberIdsRef.current.includes(m.id)) {
                  deletedMemberIdsRef.current.push(m.id);
                }
              });

              setMembers(prev => [
                ...prev.filter(m => m.departmentId !== selectedDeptId),
                ...updatedList
              ]);

              updateHasUnsavedChanges(true);
              alert(`성공적으로 백업 파일에서 ${parsed.length}명의 부서원 정보를 장바구니에 불러왔습니다!\n\n(참고: 이를 클라우드 서버에 영구 영사하려면 툴바의 [서버에 저장] 버튼을 누르시면 됩니다.)`);
              setGroups([]);
            } else {
              alert('유효한 백업 파일 양식이 아닙니다. 부서원 목록이 정확히 들어있어야 합니다.');
            }
          } else {
            alert('부서원 배열 형식이 아니기 때문에 복원하지 못했습니다.');
          }
        } catch (err) {
          alert('백업 데이터를 불러오는 중 오류가 발생했습니다. 올바른 파일인지 확인해 주세요.');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    };

    checkPasswordAuth(selectedDeptId, action);
  };

  // Save current active department list to Cloud Server (Firestore)
  const handleSaveToServer = async () => {
    if (!selectedDeptId) return;

    const action = async () => {
      setIsSavingToServer(true);
      try {
        const operations: { type: 'set' | 'delete'; id: string; data?: any }[] = [];

        deletedMemberIdsRef.current.forEach((id) => {
          operations.push({ type: 'delete', id });
        });

        filteredMembers.forEach((m) => {
          operations.push({ type: 'set', id: m.id, data: m });
        });

        // Split operations into smaller chunks (e.g., 15 at a time) to prevent large payload network congestion & slow response timeout
        const chunkSize = 15;
        const totalOps = operations.length;
        
        for (let i = 0; i < totalOps; i += chunkSize) {
          const chunk = operations.slice(i, i + chunkSize);
          const batch = writeBatch(db);

          chunk.forEach((op) => {
            const mRef = doc(db, 'members', op.id);
            if (op.type === 'delete') {
              batch.delete(mRef);
            } else {
              batch.set(mRef, op.data);
            }
          });

          // Execute write chunk with a safe, sturdy 15-second timeout per batch operation
          await withTimeout(batch.commit(), 15000);
        }

        // Reset unsaved changes and delete queue on successful batch commits
        deletedMemberIdsRef.current = [];
        updateHasUnsavedChanges(false);
        setIsOfflineMode(false); // Restore live database sync cleanly
        alert('🎉 성공적으로 부서원 명단이 원격 클라우드 서버에 안전하게 저장 및 실시간 동기화되었습니다!');
      } catch (err: any) {
        console.error('Firestore save failed:', err);
        const errMsg = err?.message || '';
        if (errMsg.includes('permission-denied') || errMsg.includes('Missing or insufficient permissions')) {
          alert('🔒 서버 귀속 오류:\n\n가입 승인이 아직 완료되지 않은 일반 회원이거나 수정 권한이 없습니다. 최고관리자(gukhyunglee@gmail.com)에게 가입 승인을 요청하신 후 다시 시도해 주세요.\n\n(안내: 브라우저 임시 저장소에는 안전하게 등록되었으므로 이 컴퓨터에서는 중단 없이 사용 가능합니다!)');
        } else if (errMsg.includes('Timeout') || errMsg.includes('시간 초과') || errMsg.includes('timeout')) {
          alert('⚠️ 서버 응답 시간 초과 (Timeout):\n\n현재 원격 서버와의 통신 지연으로 가용한 직접 전송이 중단되었습니다. 하지만 작성하신 명단은 사용 중이신 브라우저 안전 저장소(LocalStorage)에 실시간으로 자동 완벽 백업되어 있으므로, 새로고침이나 컴퓨터를 껐다 켜도 데이터가 전혀 유실되지 않고 그대로 유지됩니다!\n\n💡 해결 팁:\n1. sandbox iframe 내에서는 간혹 소켓 연결이 차단될 수 있습니다. 화면 상단 또는 브라우저의 새 창(새 탭) 열기 버튼을 클릭하여 전체 화면으로 앱을 접속해 저장을 시도해보세요.\n2. 혹은 네트워크 상태가 원활해지면 다시 [서버에 저장] 버튼을 누르시면 정상 반영됩니다.');
        } else {
          alert(`⚠️ 서버 저장 일시 지연 (${err.message || err}):\n\n현재 클라우드 전송에 실패하였습니다. 데이터는 유실되지 않고 브라우저 임시 로컬 보관소에 안전하게 자동 저장되었습니다!`);
        }
      } finally {
        setIsSavingToServer(false);
      }
    };

    checkPasswordAuth(selectedDeptId, action);
  };

  // Shuffle & Divide algorithm with step animations (Using filteredMembers instead of global members)
  const triggerShuffle = () => {
    const activeMembers = filteredMembers.filter((m) => m.selected !== false);

    if (filteredMembers.length === 0) {
      alert('추첨할 부서원이 없습니다. 부서원을 등록하거나 부서를 생성해주세요!');
      return;
    }
    if (activeMembers.length === 0) {
      alert('추첨(편성)에 참여할 부서원이 선택되지 않았습니다. 명단 목록에서 사진 왼쪽 체크박스를 활성화해주세요!');
      return;
    }

    if (drawType === 'group') {
      if (groupCount < 1) {
        alert('최소 1개 이상의 조를 입력하셔야 합니다.');
        return;
      }
    } else {
      if (luckyDrawCount < 1) {
        alert('최소 1명 이상의 추첨 인원을 설정하셔야 합니다.');
        return;
      }
    }

    const actualGroupCount = Math.min(groupCount, activeMembers.length);
    const actualLuckyCount = Math.min(luckyDrawCount, activeMembers.length);

    // Decide active style at run-time if RANDOM is chosen
    let activeStyleDecision = selectedShuffleStyle;
    if (selectedShuffleStyle === ShuffleStyle.RANDOM) {
      const styles = [
        ShuffleStyle.ROULETTE,
        ShuffleStyle.MATRIX,
        ShuffleStyle.SLOT_MACHINE,
        ShuffleStyle.VORTEX,
        ShuffleStyle.CARD_DEAL,
      ];
      activeStyleDecision = styles[Math.floor(Math.random() * styles.length)];
    }
    setActiveShuffleStyle(activeStyleDecision);

    setIsShuffling(true);
    setActiveStep(2);
    setShufflePhase('preparing');

    // 1. Prepare Style-specific data structures
    if (activeStyleDecision === ShuffleStyle.SLOT_MACHINE) {
      // Build separate reels with randomized members for slot machine style
      const reels: Member[][] = [];
      const numReels = Math.min(4, (drawType === 'group' ? actualGroupCount : actualLuckyCount) || 3);
      for (let i = 0; i < numReels; i++) {
        // Create a long list for infinite scroll feeling
        const reelList: Member[] = [];
        for (let j = 0; j < 6; j++) {
          reelList.push(...[...activeMembers].sort(() => Math.random() - 0.5));
        }
        reels.push(reelList.slice(0, 18));
      }
      setSlotMachineReels(reels);
    } else if (activeStyleDecision === ShuffleStyle.VORTEX) {
      // Prepare a random subset or all members for spiral orbit simulation
      const subset = [...activeMembers].sort(() => Math.random() - 0.5).slice(0, 18);
      setVortexMiniMembers(subset);
    }

    let counter = 0;
    const intervalTime = 70;
    // Set a solid 2.4s scrambling time for maximum suspense and build-up
    const totalFlashingTime = 2400;

    setTimeout(() => {
      setShufflePhase('scrambling');

      const flasher = setInterval(() => {
        // Keep selecting random members for visual flashing across all styles
        const randomIdx = Math.floor(Math.random() * activeMembers.length);
        setActiveShuffleMember(activeMembers[randomIdx] as Member);
        counter += intervalTime;

        if (counter >= totalFlashingTime) {
          clearInterval(flasher);
          setShufflePhase('positioning');

          setTimeout(() => {
            const shuffled = shuffleArray<Member>(activeMembers);

            if (drawType === 'group') {
              const frNames = ['사과조', '바나나조', '딸기조', '오렌지조', '포도조', '수박조', '멜론조', '체리조', '복숭아조', '파인애플조', '레몬조', '망고조'];
              const anNames = ['사자조', '호랑이조', '독수리조', '곰조', '여우조', '토끼조', '판다조', '돌고래조', '펭귄조', '올빼미조', '늑대조', '다람쥐조'];
              const gmNames = ['다이아몬드조', '루비조', '사파이어조', '에메랄드조', '진주조', '자수정조', '오팔조', '토파즈조', '가넷조', '아쿠아마린조'];

              const generatedGroups: Group[] = Array.from({ length: actualGroupCount }, (_, i) => {
                let groupName = `TEAM ${String(i + 1).padStart(2, '0')}`;
                if (groupNamingStyle === 'template_kor') {
                  groupName = `${i + 1}조`;
                } else if (groupNamingStyle === 'theme_fruits') {
                  groupName = frNames[i % frNames.length];
                } else if (groupNamingStyle === 'theme_animals') {
                  groupName = anNames[i % anNames.length];
                } else if (groupNamingStyle === 'theme_gemstones') {
                  groupName = gmNames[i % gmNames.length];
                } else if (groupNamingStyle === 'custom' && customGroupNamesStr.trim()) {
                  const customList = customGroupNamesStr
                    .split(/[,;\n\t]+/)
                    .map((n) => n.trim())
                    .filter((n) => n.length > 0);
                  if (customList[i]) {
                    groupName = customList[i];
                  } else {
                    groupName = `${i + 1}조`;
                  }
                }
                return {
                  id: `g-${i + 1}`,
                  name: groupName,
                  members: [],
                };
              });

              shuffled.forEach((member, index) => {
                generatedGroups[index % actualGroupCount].members.push(member);
              });

              setGroups(generatedGroups);
            } else {
              // Lucky Draw mode: pick the first actualLuckyCount from shuffled list
              const winners = shuffled.slice(0, actualLuckyCount);
              setLuckyDrawWinners(winners);
            }

            setShufflePhase('completed');

            // Hold on completion phase for the gorgeous blast animation effect
            setTimeout(() => {
              setIsShuffling(false);
              setShufflePhase('idle');
              setActiveShuffleMember(null);
              setSlotMachineReels([]);
              setVortexMiniMembers([]);
            }, 1200);
          }, 800);
        }
      }, intervalTime);
    }, 500);
  };

  // Rename a dynamic team group
  const handleRenameGroup = (groupId: string, newName: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, name: newName } : g))
    );
  };

  const handleCopyResults = () => {
    if (drawType === 'group') {
      if (groups.length === 0) return;

      let resultText = `📋 [조 편성 결과]\n📅 편성 시간: ${new Date().toLocaleString('ko-KR')}\n\n`;
      groups.forEach((g) => {
        const memberNames = g.members.map((m) => `${m.name}(${m.role || '팀원'})`).join(', ');
        resultText += `🔸 ${g.name} (${g.members.length}명):\n   👉 ${memberNames || '배정인원 없음'}\n\n`;
      });
      resultText += `🎉 새로 짜인 조원들과 함께 최고의 성과를 내보세요! 🔥`;

      copyToClipboard(resultText, () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } else {
      if (luckyDrawWinners.length === 0) return;

      let resultText = `🍀 [럭키 추첨 당첨 결과]\n📅 추첨 시간: ${new Date().toLocaleString('ko-KR')}\n\n`;
      luckyDrawWinners.forEach((m, idx) => {
        resultText += `🎉 당첨 ${idx + 1}순위: ${m.name}(${m.role || '팀원'})\n`;
      });
      resultText += `\n축하합니다! 🍀 당첨자 분들은 뜨거운 축하의 박수를 보내주세요! 🔥`;

      copyToClipboard(resultText, () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const handleCaptureResults = async () => {
    const targetElement = document.getElementById('shuffle-results-capture-area');
    if (!targetElement) return;

    try {
      setCapturing(true);

      const canvas = await html2canvas(targetElement, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
      });

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const title = drawType === 'group' ? '조편성결과' : '럭키추첨결과';
      link.href = dataUrl;
      link.download = `${title}_${timestamp}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setCaptured(true);
      setTimeout(() => setCaptured(false), 2000);
    } catch (error) {
      console.error('Failed to capture results:', error);
    } finally {
      setCapturing(false);
    }
  };



  // Render responsive Brand Header & Hamburger Menu
  const renderNavbar = () => {
    const isLoggedIn = !!currentUser && !!appUser;
    const isApproved = appUser?.approved === true;
    const isAdmin = appUser?.role === 'admin';

    return (
      <nav id="nav-header" className="h-16 bg-white border-b border-slate-200 px-5 md:px-8 flex items-center justify-between shadow-sm z-50 shrink-0 relative select-none">
        {/* Brand logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-md shadow-indigo-100">
            <div className="w-4 h-4 border-2 border-white rounded-sm"></div>
          </div>
          <span className="font-extrabold text-xl tracking-tight text-slate-800 font-display">
            TeamShuffle
          </span>
        </div>

        {/* --- DESKTOP VIEW NAV ITEMS (md and up) --- */}
        <div className="hidden md:flex items-center gap-4 select-none">
          {isLoggedIn && isApproved && (
            <div className="flex items-center gap-2 select-none md:gap-3">
              {showInstallBadge && (
                <button
                  onClick={handleInstallClick}
                  className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-sm hover:shadow-indigo-100 cursor-pointer hover:scale-[1.03]"
                  title="TeamShuffle 스마트 앱 다운로드 및 홈 화면 추가"
                >
                  <Smartphone className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span>앱 설치</span>
                </button>
              )}

              <button
                onClick={() => setActiveStep(1)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeStep === 1
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                등록
              </button>
              <span className="text-slate-300 text-xs">➔</span>
              <button
                onClick={() => setActiveStep(2)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeStep === 2
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                추첨
              </button>

              {isAdmin && (
                <>
                  <span className="text-slate-300 text-xs">➔</span>
                  <button
                    onClick={() => setActiveStep(3)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeStep === 3
                        ? 'bg-indigo-50 text-indigo-600'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    승인 관리
                  </button>
                </>
              )}
            </div>
          )}

          {/* User profile action state (or compact login trigger) on desktop */}
          {isLoggedIn ? (
            <div className="flex items-center gap-2.5 border border-slate-200 pl-2 pr-3 py-1 rounded-full bg-slate-50 shadow-2xs select-none">
              <img
                src={appUser.photoUrl || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&auto=format&fit=crop&q=80'}
                alt={appUser.displayName}
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-full border border-slate-300"
              />
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-[11px] font-extrabold text-slate-700 leading-none">
                  {appUser.displayName}
                </span>
                <span className="text-[9px] font-bold text-indigo-600 mt-0.5 leading-none">
                  {isAdmin ? '최고관리자' : isApproved ? '승인완료' : '승인대기'}
                </span>
              </div>
              <button
                onClick={handleLogoutAction}
                className="hover:text-rose-600 font-extrabold text-[10px] text-slate-400 shrink-0 transition-colors ml-1 cursor-pointer pl-1.5 border-l border-slate-200"
              >
                로그아웃
              </button>
            </div>
          ) : (
            <button
              onClick={handleGoogleLogin}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-3xs cursor-pointer transition-all active:scale-[0.98]"
            >
              로그인
            </button>
          )}
        </div>

        {/* --- MOBILE VIEW HAMBURGER TRIGGER --- */}
        <div className="flex md:hidden items-center gap-2">
          {showInstallBadge && !isLoggedIn && (
            <button
              onClick={handleInstallClick}
              className="p-1 px-2.5 py-1 text-slate-500 hover:text-indigo-600 transition-colors text-[10px] font-bold bg-slate-50 border border-slate-200/60 rounded-lg flex items-center gap-1"
              title="앱 설치"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
              <span>설치</span>
            </button>
          )}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 -mr-1 bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors cursor-pointer select-none border border-slate-200/50"
            aria-label="모바일 메뉴"
          >
            {isMobileMenuOpen ? (
              <X className="w-5 h-5 shrink-0 text-slate-600" />
            ) : (
              <Menu className="w-5 h-5 shrink-0 text-slate-600" />
            )}
          </button>
        </div>

        {/* --- MOBILE DROPDOWN HAMBURGER DRAWER SHEET PANEL --- */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="absolute top-16 left-0 right-0 bg-white border-b border-slate-200/95 shadow-xl z-50 flex flex-col p-5 md:hidden gap-4"
            >
              {/* Profile Card Container inside Hamburger menu */}
              {isLoggedIn ? (
                <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200/85 rounded-2xl">
                  <img
                    src={appUser.photoUrl || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&auto=format&fit=crop&q=80'}
                    alt={appUser.displayName}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full border border-slate-300 shrink-0"
                  />
                  <div className="flex-1 text-left min-w-0">
                    <span className="text-xs font-extrabold text-slate-800 block truncate leading-tight">
                      {appUser.displayName}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold block truncate mt-0.5 leading-none">
                      {currentUser?.email || appUser?.email}
                    </span>
                    <span className="inline-flex mt-1.5 text-[8.5px] font-extrabold text-white bg-indigo-600 px-1.5 py-0.5 rounded-md leading-none tracking-wider select-none uppercase">
                      {isAdmin ? '최고관리자 👑' : isApproved ? '승인완료 ✅' : '가입승인 대기 🔒'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-slate-50 border border-dashed border-slate-200/80 rounded-2xl text-center">
                  <p className="text-[11px] font-extrabold text-slate-500 leading-relaxed max-w-xs mx-auto text-center font-sans">
                    🔒 공정 투명한 부서원 셔플 추첨기 사용을 위해 간편 구글 로그인을 완성해 주세요!
                  </p>
                </div>
              )}

              {/* Navigation Items in mobile layout */}
              <div className="flex flex-col gap-1.5 text-left">
                {isLoggedIn && isApproved ? (
                  <>
                    <button
                      onClick={() => {
                        setActiveStep(1);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-extrabold transition-all text-left ${
                        activeStep === 1
                          ? 'bg-indigo-50/80 text-indigo-600 border-l-4 border-indigo-600 pl-2.5'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2 font-bold font-sans">
                        <Users className="w-4 h-4 shrink-0 text-slate-400" />
                        <span>명단 및 부서 등록 관리</span>
                      </span>
                      <span className="text-[9px] font-bold text-slate-300">이동 ➔</span>
                    </button>

                    <button
                      onClick={() => {
                        setActiveStep(2);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-extrabold transition-all text-left ${
                        activeStep === 2
                          ? 'bg-indigo-50/80 text-indigo-600 border-l-4 border-indigo-600 pl-2.5'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2 font-bold font-sans">
                        <Shuffle className="w-4 h-4 shrink-0 text-slate-400" />
                        <span>셔플 무작위 조 추첨</span>
                      </span>
                      <span className="text-[9px] font-bold text-slate-300">이동 ➔</span>
                    </button>

                    {isAdmin && (
                      <button
                        onClick={() => {
                          setActiveStep(3);
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-extrabold transition-all text-left ${
                          activeStep === 3
                            ? 'bg-indigo-50/80 text-indigo-600 border-l-4 border-indigo-600 pl-2.5'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className="flex items-center gap-2 text-indigo-650 font-bold font-sans">
                          <Crown className="w-4 h-4 text-indigo-500 shrink-0" />
                          <span>가입 유저 승인 및 권한 관리</span>
                        </span>
                        <span className="text-[9px] font-bold text-indigo-300">관리자 ➔</span>
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <div className="p-3 text-[11px] text-slate-400 font-bold flex items-center justify-between bg-slate-50/50 rounded-xl select-none border border-dashed border-slate-200">
                      <span className="flex items-center gap-2 font-bold">
                        <Users className="w-3.5 h-3.5 text-slate-300" />
                        <span>명단 및 부서 등록</span>
                      </span>
                      <span className="text-[9px] text-slate-300">로그인 필요 🔒</span>
                    </div>
                    <div className="p-3 text-[11px] text-slate-400 font-bold flex items-center justify-between bg-slate-50/50 rounded-xl select-none border border-dashed border-slate-200">
                      <span className="flex items-center gap-2 font-bold font-sans">
                        <Shuffle className="w-3.5 h-3.5 text-slate-300" />
                        <span>셔플 무작위 조 추첨</span>
                      </span>
                      <span className="text-[9px] text-slate-300">로그인 필요 🔒</span>
                    </div>
                  </>
                )}
              </div>

              {/* Action buttons and controls at bottom of mobile menu */}
              <div className="flex flex-col gap-2 pt-3 border-t border-slate-100">
                {showInstallBadge && (
                  <button
                    onClick={() => {
                      handleInstallClick();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-extrabold rounded-xl transition-all cursor-pointer shadow-3xs"
                  >
                    <Smartphone className="w-4 h-4 text-emerald-500 shrink-0 animate-bounce" />
                    <span>홈 화면에 스마트 앱 단축 아이콘 설치</span>
                  </button>
                )}

                {isLoggedIn ? (
                  <button
                    onClick={() => {
                      handleLogoutAction();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full py-3 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-extrabold rounded-xl border border-rose-100 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-3xs font-sans"
                  >
                    <span>구글 계정 안전 로그아웃</span>
                  </button>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    <button
                      onClick={() => {
                        handleGoogleLogin();
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] font-sans"
                    >
                      {/* Integrated Google SVG Icon */}
                      <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#FFFFFF"/>
                      </svg>
                      <span>Google 계정으로 계속하기 (로그인)</span>
                    </button>
                    <button
                      onClick={() => {
                        handleGoogleRedirectLogin();
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full py-2.5 text-indigo-600 hover:bg-indigo-50 text-[10.5px] font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 border border-indigo-150 cursor-pointer font-sans"
                    >
                      <RefreshCw className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
                      <span>팝업 연결 이슈 시 페이지 이동 로그인</span>
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    );
  };

  // 1. Loading screen
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans text-slate-900 select-none p-4">
        <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">
          <div className="flex flex-col items-center gap-4 animate-pulse">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-150">
              <div className="w-6 h-6 border-3 border-white rounded-md"></div>
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-800 font-display">TeamShuffle</h1>
            <p className="text-xs text-slate-400 font-bold tracking-wider uppercase">보안 연결 및 사용자 정보 구성 중...</p>
          </div>

          {showLoadingWarning && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full bg-white border border-rose-100 rounded-2xl p-5 shadow-lg flex flex-col gap-4 mt-2"
            >
              <div className="flex items-start gap-2.5 text-left">
                <span className="text-lg text-rose-500 mt-0.5">⚠️</span>
                <div className="flex-1">
                  <h3 className="text-xs font-bold text-slate-800">연결 지연 안내</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Firebase와의 보안 연결이 지연되고 있습니다. 
                    인터넷 상태가 느리거나, 파티션 브라우저 보안 이슈일 수 있습니다.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 w-full">
                <button
                  id="loading-force-offline-btn"
                  onClick={enableOfflineMode}
                  className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition duration-150 shadow-sm"
                >
                  오프라인 모드로 우선 시작하기 (비로그인)
                </button>
                
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    id="loading-clear-config-btn"
                    onClick={() => {
                      safeStorage.removeItem('CUSTOM_FIREBASE_CONFIG');
                      safeStorage.removeItem('force_offline_mode');
                      window.location.reload();
                    }}
                    className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[10px] rounded-lg transition duration-150"
                  >
                    설정 초기화 후 새로고침
                  </button>
                  <button
                    id="loading-logout-btn"
                    onClick={async () => {
                      try {
                        await logout();
                      } catch(_) {}
                      window.location.reload();
                    }}
                    className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[10px] rounded-lg transition duration-150"
                  >
                    계정 세션 초기화
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    );
  }

  // 2. Google Login Landing Screen
  if (!currentUser || !appUser) {
    const isInIframe = window.self !== window.top;

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 select-none overflow-y-auto">
        {/* Render responsive Brand Header & Hamburger Menu */}
        {renderNavbar()}

        {/* Center content */}
        <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
          {/* Ambient background decoration */}
          <div className="absolute top-[-10%] right-[-10%] w-[45%] h-[45%] bg-indigo-50/50 rounded-full blur-3xl -z-10" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[45%] h-[45%] bg-violet-50/40 rounded-full blur-3xl -z-10" />

          <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center relative gap-5 my-8">
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-150 mb-4">
              <div className="w-6 h-6 border-3 border-white rounded-md"></div>
            </div>

            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-800 font-display">
              TeamShuffle 조 편성 엔진
            </h1>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed max-w-xs">
              공정하고 투명한 부서원 셔플 조 추첨 서비스입니다.<br/>
              구글 계정으로 로그인하여 안전하게 부서 명단을 관리해보세요.
            </p>
          </div>

          <div className="w-full h-[1px] bg-slate-100 my-1" />

          {/* Iframe Warnings and Actions */}
          {isInIframe && (
            <div id="iframe-restriction-alert" className="w-full bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 text-left flex flex-col gap-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="text-[11px] font-extrabold text-indigo-950 leading-tight block">
                    구글 크롬/사파리 iframe 보안 이슈 안내
                  </span>
                  <span className="text-[10px] text-indigo-800 mt-1 block leading-normal font-semibold">
                    브라우저의 "3자 쿠키 및 로컬 저장소 제한 정책"으로 인해 AI Studio 내부화면(iframe)에서는 구글 로그인창이 차단되거나 깜빡이고 동작하지 않을 수 있습니다. 
                  </span>
                </div>
              </div>
              
              {/* Native user gesture anchor link to open in new tab */}
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-sm hover:scale-[1.01] active:scale-[0.99]"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>독립된 새 창(새 탭)에서 실행하기</span>
              </a>
            </div>
          )}

          {/* Error messages if any */}
          {authError && (
            <div id="auth-error-alert" className="w-full bg-rose-50 border border-rose-100 rounded-2xl p-4 text-left flex flex-col gap-3">
              <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5 animate-pulse" />
                <div className="flex-1">
                  <span className="text-xs font-extrabold text-rose-900 leading-tight block">
                    데이터베이스 오류 발생
                  </span>
                  <span className="text-[11px] text-rose-700 mt-1 block leading-relaxed break-all font-semibold">
                    {authError}
                  </span>
                </div>
              </div>

              {authError.includes('권한') && (
                <div className="mt-2 bg-white/60 rounded-xl p-3 border border-rose-200">
                  <span className="text-[10px] font-bold text-rose-900 block mb-2">💡 Firebase Console의 [Firestore Database] &gt; [Rules]에 다음 코드를 복사해서 붙여넣으세요:</span>
                  <div className="relative group">
                    <pre className="text-[9px] text-slate-800 bg-white p-2.5 rounded-lg overflow-x-auto border border-slate-200 max-h-32">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true; // ⚠️ 개발용 임시 설정
    }
  }
}`}
                    </pre>
                    <button 
                      onClick={() => {
                        const rulesText = "rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} {\n      allow read, write: if true;\n    }\n  }\n}";
                        copyToClipboard(rulesText, () => {
                          setRulesCopied(true);
                          setTimeout(() => setRulesCopied(false), 2000);
                        });
                      }}
                      className={`absolute top-1.5 right-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black border shadow-sm transition-all flex items-center gap-1 cursor-pointer ${
                        rulesCopied 
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700" 
                          : "bg-slate-800 hover:bg-slate-900 text-white border-slate-900"
                      }`}
                    >
                      {rulesCopied ? "✓ 복사 완료!" : "📋 규칙 복사"}
                    </button>
                  </div>
                  <span className="text-[9px] text-rose-600 mt-2 block font-medium">* 위 코드는 빠른 테스트를 위한 전체 허용 규칙입니다. 추후 프로덕션에서는 보안을 강화해야 합니다.</span>
                </div>
              )}

              {/* Offer offline transition instantly if any Firestore/Auth error occurs */}
              <div className="flex flex-col gap-2 border-t border-rose-200/50 pt-2.5 mt-1">
                <button
                  type="button"
                  onClick={enableOfflineMode}
                  className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-extrabold transition-all hover:scale-[1.01] text-center cursor-pointer"
                >
                  오프라인 캐시 전용 모드로 시작하기 (오류 우회 / 비로그인 기능)
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    safeStorage.removeItem('CUSTOM_FIREBASE_CONFIG');
                    safeStorage.removeItem('force_offline_mode');
                    window.location.reload();
                  }}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-750 border border-slate-200 rounded-xl text-[10px] font-extrabold transition-all text-center cursor-pointer"
                >
                  커스텀 설정 초기화하고 기본 데모 DB로 시도
                </button>
              </div>
            </div>
          )}

          {/* User profile is loading transition support state */}
          {currentUser && !appUser && !authError && (
            <div className="w-full bg-amber-50 border border-amber-150 rounded-2xl p-4 text-left flex flex-col gap-2.5">
              <div className="flex items-start gap-2">
                <RefreshCw className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 animate-spin" />
                <div className="flex-1">
                  <span className="text-[11px] font-extrabold text-amber-950 leading-tight block">
                    구글 로그인 성공. 프로필 로딩 중...
                  </span>
                  <span className="text-[10px] text-amber-800 mt-1 block leading-normal font-semibold">
                    로그인은 완료되었으나, 개인 Firebase Database(Firestore)로부터 사용자의 회원 프로필 정보를 조회/작성하는 데 시간이 걸리고 있습니다. 
                    계속 로딩이 멈춰 있다면 아래 버튼을 사용하여 오프라인 모드로 우선 실행할 수 있습니다.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={enableOfflineMode}
                className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-extrabold transition-all hover:scale-[1.01] text-center cursor-pointer"
              >
                오프라인 강제 모드로 구동하기
              </button>
            </div>
          )}

          {/* Standard Login trigger button (Always shown for high visibility across all environments) */}
          <div className="w-full flex flex-col gap-3">
            <button
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 px-5 py-3.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-extrabold rounded-2xl transition-all cursor-pointer shadow-xs hover:border-slate-300 active:scale-[0.99] hover:scale-[1.01]"
            >
              {/* Custom Google inline icon */}
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span className="text-sm text-slate-700 font-bold">Google 계정으로 계속하기</span>
            </button>

            {/* Redirect Login Flow as a foolproof fallback */}
            <div className="text-center mt-0.5">
              <span className="text-[10px] text-slate-400 font-semibold block mb-1">
                팝업이 차단되거나 로그인창이 보이지 않나요?
              </span>
              <button
                onClick={handleGoogleRedirectLogin}
                className="text-indigo-600 hover:text-indigo-700 hover:underline text-[11px] font-extrabold cursor-pointer inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>페이지 이동(Redirect) 방식으로 로그인하기</span>
              </button>
            </div>
          </div>

          <p className="text-[10px] text-slate-400 font-bold leading-normal">
            최초 로그인 시 승인 대기로 등록되며,<br/>
            최고 관리자 승인 후 즉시 사용 가능합니다.
          </p>
        </div>
      </div>
    </div>
    );
  }

  // 3. User is not approved yet -> show Pending approval Screen
  if (appUser.approved !== true) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 select-none overflow-y-auto">
        {/* Render responsive Brand Header & Hamburger Menu */}
        {renderNavbar()}

        {/* Center content */}
        <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
          {/* Ambient background decoration */}
          <div className="absolute top-[-10%] right-[-10%] w-[45%] h-[45%] bg-amber-50/40 rounded-full blur-3xl -z-10" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[45%] h-[45%] bg-indigo-50/30 rounded-full blur-3xl -z-10" />

          <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center relative my-8">
          {/* Pulsing Lock Icon */}
          <div className="w-14 h-14 bg-amber-50 border border-amber-100 rounded-full flex items-center justify-center mb-5 animate-bounce shadow-md">
            <Lock className="w-6 h-6 text-amber-500 fill-amber-50" />
          </div>

          <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-800">
            가입 승인 대기 중 🔒
          </h2>
          <p className="text-xs text-slate-400 font-bold mt-1.5">{currentUser.email}</p>

          <p className="text-xs text-slate-500 mt-4 leading-normal font-medium max-w-xs">
            회원님의 구글 로그인 정보가 안전하게 기록되었습니다.<br/><br/>
            현재 <strong>승인 대기 상태</strong>입니다. 최고관리자(gukhyunglee@gmail.com)가 확인 후 가입 승인을 완료하면, 이 컴퓨터에서 페이지가 실시간으로 자동 활성화됩니다!
          </p>

          <div className="w-full h-[1px] bg-slate-100 my-5" />

          {/* Simple sign out / account change helper */}
          <button
            onClick={handleLogoutAction}
            className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer hover:scale-[1.01]"
          >
            다른 계정으로 로그인 또는 로그아웃
          </button>
        </div>
      </div>
    </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 overflow-hidden select-none">
      
      {/* Custom dynamic styles for gorgeous shuffle animations */}
      <style>{`
        @keyframes matrix-fall-slow {
          0% { transform: translateY(-120%); opacity: 0; }
          10% { opacity: 0.8; }
          90% { opacity: 0.8; }
          100% { transform: translateY(120%); opacity: 0; }
        }
        @keyframes custom-fast-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse-glorious {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.05); filter: brightness(1.15) drop-shadow(0 0 20px rgba(99, 102, 241, 0.6)); }
        }
        @keyframes slot-shl-spin {
          0% { transform: translateY(0); }
          100% { transform: translateY(-1500px); }
        }
        @keyframes cyber-scan {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
        @keyframes spiral-orbit {
          0% { transform: rotate(0deg) translateX(80px) rotate(0deg); }
          50% { transform: rotate(180deg) translateX(110px) rotate(-180deg); }
          100% { transform: rotate(360deg) translateX(80px) rotate(-360deg); }
        }
        @keyframes float-poker {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-8px) rotate(2deg); }
        }
        .animate-matrix-green {
          animation: matrix-fall-slow var(--fall-duration) linear infinite;
        }
        .animate-custom-orbit {
          animation: spiral-orbit var(--orbit-duration) linear infinite;
        }
      `}</style>
      
      {/* 1. TOP RESPONSIVE BRAND HEADER & HAMBURGER MENU */}
      {renderNavbar()}

      {/* Main wizard body */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {activeStep === 1 ? (
            /* STEP 1 Screen window (Department List and Roster Data Setup) */
            <motion.div
              key="step1-window"
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 flex flex-col p-4 md:p-8 lg:p-10 xl:p-12 gap-6 md:gap-8 overflow-y-auto max-w-[1700px] mx-auto w-full"
            >
              {/* Grid-based interactive department switcher card */}
              <div className="w-full bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-7 md:p-8 shadow-sm shrink-0">
                {/* Horizontal / Grid-friendly dynamic department list with lock/unlock overlays */}
                <div className="flex flex-wrap gap-3">
                  {/* Add Department Button integrated inside the grid */}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingDept(null);
                      setDeptNameInput('');
                      setDeptPasswordInput('');
                      setIsDeptModalOpen(true);
                    }}
                    className="px-4.5 py-4 sm:px-6 sm:py-5 rounded-2xl sm:rounded-3xl border border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/30 hover:bg-indigo-50/20 text-slate-700 hover:text-indigo-600 transition-all cursor-pointer flex items-center justify-center gap-2 min-w-[160px] md:min-w-[200px] select-none text-xs sm:text-sm font-black"
                  >
                    <Plus className="w-4 h-4 text-indigo-500" />
                    <span>새 부서 추가</span>
                  </button>

                  {departments.map((dept) => {
                    const isActive = selectedDeptId === dept.id;
                    const isUnlocked = unlockedDepts.includes(dept.id);
                    const memberCount = members.filter(m => m.departmentId === dept.id).length;

                    return (
                      <div
                        key={dept.id}
                        onClick={() => setSelectedDeptId(dept.id)}
                        className={`px-4.5 py-4 sm:px-6 sm:py-5 rounded-2xl sm:rounded-3xl border transition-all cursor-pointer flex items-center justify-between gap-4 min-w-[160px] md:min-w-[200px] select-none hover:shadow-md relative ${
                          isActive
                            ? 'bg-indigo-50/70 border-indigo-200 shadow-sm ring-2 ring-indigo-500/10'
                            : 'bg-slate-50/60 border-slate-200/80 hover:bg-slate-100/50 hover:border-slate-300'
                        }`}
                      >
                        <div className="min-w-0 flex-1 space-y-1 sm:space-y-1.5">
                          <h4 className={`text-xs sm:text-sm md:text-base font-black truncate ${isActive ? 'text-indigo-805' : 'text-slate-750'}`}>
                            {dept.name}
                          </h4>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] sm:text-xs text-slate-505 font-bold">인원: {memberCount}명</span>
                            <span className="text-slate-300 text-[10px]">•</span>
                            <span className={`text-[10px] sm:text-xs font-black flex items-center gap-0.5 ${isUnlocked ? 'text-emerald-600' : 'text-slate-500'}`}>
                              {isUnlocked ? <Unlock className="w-3 h-3 text-emerald-500" /> : <Lock className="w-3 h-3 text-slate-400" />}
                              {isUnlocked ? '편집인증' : '수정잠금'}
                            </span>
                          </div>
                        </div>

                        {/* Inline actions inside selected department cell */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingDept(dept);
                              setDeptNameInput(dept.name);
                              setDeptPasswordInput(dept.password);
                              setIsDeptModalOpen(true);
                            }}
                            className="p-1.5 sm:p-2 sm:px-2.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-indigo-600 transition-colors shadow-2xs"
                            title="부서 정보 및 권한 암호 수정"
                          >
                            <Edit3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteDepartment(dept.id);
                            }}
                            className="p-1.5 sm:p-2 sm:px-2.5 rounded-lg bg-white hover:bg-red-50 border border-slate-200 text-slate-500 hover:text-red-500 transition-colors shadow-2xs"
                            title="이 부서 영구 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4-5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Full Width Integrated List & Controls Panel */}
              <div className="flex-1 w-full bg-white border border-slate-200 rounded-3xl shadow-sm p-6 sm:p-8 md:p-10 flex flex-col min-h-[450px]">
                {/* Panel Header */}
                <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 pb-4 border-b border-slate-150 shrink-0 select-none">
                  <div className="flex flex-wrap items-center gap-3.5 min-w-0">
                    <h3 className="text-sm sm:text-base md:text-lg lg:text-xl font-black text-slate-800 flex items-center gap-2 shrink-0 select-none">
                      {departments.find(d => d.id === selectedDeptId)?.name || '선택된 부서'} 명단
                      <span className="text-xs bg-indigo-50 text-indigo-700 font-extrabold px-2.5 py-1 rounded-lg border border-indigo-100/50 shadow-3xs">
                        {filteredMembers.length}명
                      </span>
                      {hasUnsavedChanges && (
                        <span className="text-[10px] sm:text-xs bg-amber-500 text-white font-extrabold px-2.5 py-1 rounded-full flex items-center gap-1 animate-pulse shadow-sm">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>미저장 변경사항이 있습니다</span>
                        </span>
                      )}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2.5 text-xs sm:text-sm text-slate-500 font-bold select-none shrink-0">
                      <span className="text-indigo-600 bg-indigo-50/50 px-2.5 py-1 rounded-lg">참가 {filteredMembers.filter(m => m.selected !== false).length}명</span>
                      <span className="text-slate-300">|</span>
                      <span className="bg-slate-100 px-2.5 py-1 rounded-lg">제외 {filteredMembers.filter(m => m.selected === false).length}명</span>
                      <span className="text-slate-300">|</span>
                      {isDbLoading ? (
                        <div className="flex items-center gap-2">
                          <span className="text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-bold border border-amber-200/30">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500" />
                            실시간 클라우드 연결 중...
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              safeStorage.setItem('force_offline_mode', 'true');
                              setIsOfflineMode(true);
                              setIsDbLoading(false);
                            }}
                            className="bg-slate-200 hover:bg-slate-250 text-slate-700 px-2 py-1 rounded-lg text-xs font-black cursor-pointer transition-colors"
                            title="데이터베이스 실시간 연결을 건너뛰고 브라우저 캐시 전용 오프라인 모드로 즉시 시작합니다."
                          >
                            오프라인 강제 전환
                          </button>
                        </div>
                      ) : isOfflineMode ? (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-bold border border-slate-200/35">
                            <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"></span>
                            로컬 오프라인 모드
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              safeStorage.removeItem('force_offline_mode');
                              window.location.reload();
                            }}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-lg text-xs font-black cursor-pointer transition-colors border border-indigo-100"
                          >
                            클라우드 연결 시도
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-bold border border-emerald-100/30">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                            실시간 클라우드 동기화 완료
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              safeStorage.setItem('force_offline_mode', 'true');
                              window.location.reload();
                            }}
                            className="bg-slate-150 hover:bg-slate-200 text-slate-600 px-2.5 py-1 rounded-lg text-xs font-black cursor-pointer transition-colors"
                          >
                            오프라인 전환
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleAll(true)}
                      className="px-4.5 py-2.5 bg-indigo-50 hover:bg-indigo-100/70 text-indigo-700 text-xs sm:text-sm font-extrabold rounded-xl transition-all cursor-pointer shadow-3xs"
                    >
                      전체선택
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleAll(false)}
                      className="px-4.5 py-2.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs sm:text-sm font-extrabold rounded-xl transition-all cursor-pointer shadow-3xs"
                    >
                      전체해제
                    </button>
                  </div>
                </div>

                {/* Highly compact Roster database Grid view with maximized density */}
                <div className="flex-1 overflow-y-auto py-4 minimal-scrollbar mt-2">
                  <AnimatePresence>
                    {filteredMembers.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-5">
                        {filteredMembers.map((member) => (
                          <MemberItemCard
                            key={member.id}
                            member={member}
                            onDelete={handleDeleteMember}
                            onToggleSelect={handleToggleSelect}
                            onEdit={(m) => {
                              setEditingMember(m);
                              setIsAddMemberModalOpen(true);
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-20 text-slate-400">
                        <Users className="w-12 h-12 mx-auto opacity-30 mb-3 text-indigo-500" />
                        <p className="text-sm font-black text-slate-600">이 부서에 등록된 부서원이 없습니다.</p>
                        <p className="text-xs text-slate-450 mt-1.5">아래의 등록 버튼을 클릭하여 명단을 추가해주세요.</p>
                      </div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Compact Toolbar at Bottom - fitting fully on a single line with Backup & Restore supports */}
                <div className="pt-5 mt-4 border-t border-slate-150 flex flex-wrap items-center justify-center gap-3 shrink-0 select-none">
                  {/* Hidden input for loading backup files */}
                  <input
                    id="import-backup-file"
                    type="file"
                    accept=".json"
                    onChange={handleImportBackup}
                    className="hidden"
                  />

                  <button
                    id="btn-trigger-add-modal"
                    onClick={() => {
                      setEditingMember(null);
                      setIsAddMemberModalOpen(true);
                    }}
                    className="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer transition-all hover:scale-[1.02]"
                  >
                    <Plus className="w-4 h-4 text-emerald-405" />
                    <span>팀원 등록</span>
                  </button>
                  <button
                    onClick={handleSaveToServer}
                    disabled={isSavingToServer}
                    className={`px-5 py-3 font-extrabold text-xs sm:text-sm rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer relative transition-all hover:scale-[1.02] ${
                      hasUnsavedChanges 
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg' 
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-705 border border-slate-250'
                    }`}
                    title={hasUnsavedChanges ? "수정된 명단이 있습니다. 클릭하여 서버에 영구적으로 보관하세요!" : "현재 명단이 서버와 최신 상태에 있습니다."}
                  >
                    {isSavingToServer ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <Cloud className={`w-4 h-4 ${hasUnsavedChanges ? 'text-blue-105' : 'text-slate-500'}`} />
                    )}
                    <span>{isSavingToServer ? '서버 저장 중...' : '서버에 저장'}</span>
                    {hasUnsavedChanges && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-rose-500 border-2 border-white shadow-xs animate-ping" />
                    )}
                  </button>
                  <button
                    onClick={handleResetToDefault}
                    className="px-4.5 py-3 bg-white border border-slate-250 text-slate-700 hover:bg-slate-55 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-3xs"
                    title="기본 데모 부서원 목록으로 되돌려 놓습니다."
                  >
                    <RotateCcw className="w-4 h-4 text-slate-500" />
                    <span>부서인원 리셋</span>
                  </button>
                  <button
                    onClick={handleClearAll}
                    className="px-4.5 py-3 bg-red-50 border border-red-155 text-red-650 hover:bg-red-100/70 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-3xs"
                    title="모든 인원을 비웁니다."
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                    <span>부서원 전체비우기</span>
                  </button>

                  <span className="w-px h-6 bg-slate-250 hidden sm:inline" />

                  <button
                    onClick={handleExportBackup}
                    className="px-4.5 py-3 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100/50 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-3xs"
                    title="부서원 명단을 안전하게 PC/스마트폰에 파일로 받아놓습니다."
                  >
                    <Download className="w-4 h-4 text-indigo-650" />
                    <span>명단 파일백업</span>
                  </button>
                  <button
                    onClick={() => document.getElementById('import-backup-file')?.click()}
                    className="px-4.5 py-3 bg-emerald-50 border border-emerald-250 text-emerald-850 hover:bg-emerald-100/50 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-3xs"
                    title="저장되었던 다운로드 파일(.json)을 불러와 복구합니다."
                  >
                    <Upload className="w-4 h-4 text-emerald-600" />
                    <span>명단 파일인증/복구</span>
                  </button>
                </div>
              </div>
            </motion.div>
          ) : activeStep === 2 ? (
            /* STEP 2 Screen window (Compact Top Settings & Wide Results map) */
            <motion.div
              key="step2-window"
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 flex flex-col p-4 md:p-6 lg:p-8 gap-5 overflow-y-auto"
            >
              {/* Compact Minimized Top Control Card */}
              <div className="bg-white border border-slate-200 rounded-2xl p-3 px-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 shrink-0 transition-all">
                {/* Control Left: Single-line Navigation & small title */}
                <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                  <button
                    onClick={() => setActiveStep(1)}
                    className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 font-bold transition-all cursor-pointer hover:underline shrink-0"
                    title="부서 데이터 정보 설정 창으로 돌라갑니다."
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"></path>
                    </svg>
                    <span>등록</span>
                  </button>
                  <span className="text-slate-300 text-xs shrink-0">|</span>
                  <span className="text-xs font-bold text-slate-800 tracking-tight shrink-0">추첨 부서 지정:</span>
                  
                  {/* Department Picker dropdown for Draw Shuffle */}
                  <select
                    value={selectedDeptId || ''}
                    onChange={(e) => {
                      setSelectedDeptId(e.target.value || null);
                      setGroups([]); // Clear previous target draft values
                    }}
                    className="bg-slate-50 border border-slate-200 text-xs font-extrabold px-2.5 py-1.5 rounded-lg text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 shrink-0 cursor-pointer"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({members.filter(m => m.departmentId === d.id).length}명)
                      </option>
                    ))}
                  </select>

                  <span className="hidden sm:inline text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full shrink-0">
                    전체 {filteredMembers.length}명 / 참여예정 {filteredMembers.filter(m => m.selected !== false).length}명
                  </span>
                </div>

                {/* Control Right: Small input configuration & Instant shuffle button horizontally aligned */}
                <div className="flex flex-wrap items-center gap-3 shrink-0 justify-end w-full md:w-auto">
                  {/* Mode selector */}
                  <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setDrawType('group')}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        drawType === 'group'
                          ? 'bg-white text-indigo-600 shadow-sm'
                          : 'text-slate-500 hover:text-slate-850'
                      }`}
                    >
                      조 편성
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrawType('lucky')}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        drawType === 'lucky'
                          ? 'bg-white text-indigo-600 shadow-sm'
                          : 'text-slate-500 hover:text-slate-850'
                      }`}
                    >
                      럭키 추첨
                    </button>
                  </div>

                  {drawType === 'group' ? (
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1 px-3 md:p-1.5 md:px-4">
                      <span className="text-[11px] md:text-xs font-black text-slate-700 select-none">조 개수:</span>
                      <button
                        type="button"
                        onClick={() => setGroupCount((prev) => Math.max(1, prev - 1))}
                        disabled={groupCount <= 1}
                        className="w-6 h-6 md:w-7 md:h-7 bg-white hover:bg-slate-100 disabled:opacity-45 rounded-lg flex items-center justify-center font-extrabold text-xs text-slate-600 border border-slate-200 transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
                      >
                        -
                      </button>
                      <input
                        id="sidebar-group-input"
                        type="number"
                        min="1"
                        max={Math.max(1, filteredMembers.filter(m => m.selected !== false).length)}
                        value={groupCount}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          const activeCount = filteredMembers.filter(m => m.selected !== false).length;
                          if (!isNaN(val)) {
                            setGroupCount(Math.min(Math.max(1, activeCount || 1), Math.max(1, val)));
                          } else {
                            (e.target as any).value = '';
                          }
                        }}
                        onBlur={(e) => {
                          const val = parseInt(e.target.value, 10);
                          const activeCount = filteredMembers.filter(m => m.selected !== false).length;
                          if (isNaN(val) || val < 1) {
                            setGroupCount(3);
                          } else {
                            setGroupCount(Math.min(Math.max(1, activeCount || 1), val));
                          }
                        }}
                        className="w-10 sm:w-16 h-6 md:h-7 text-center font-black text-xs text-indigo-750 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all select-all bubble-input"
                      />
                      <button
                        type="button"
                        onClick={() => setGroupCount((prev) => Math.min(filteredMembers.filter(m => m.selected !== false).length, prev + 1))}
                        disabled={groupCount >= filteredMembers.filter(m => m.selected !== false).length}
                        className="w-6 h-6 md:w-7 md:h-7 bg-white hover:bg-slate-100 disabled:opacity-45 rounded-lg flex items-center justify-center font-extrabold text-xs text-slate-600 border border-slate-200 transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1 px-3 md:p-1.5 md:px-4">
                      <span className="text-[11px] md:text-xs font-black text-slate-700 select-none">추첨 인원:</span>
                      <button
                        type="button"
                        onClick={() => setLuckyDrawCount((prev) => Math.max(1, prev - 1))}
                        disabled={luckyDrawCount <= 1}
                        className="w-6 h-6 md:w-7 md:h-7 bg-white hover:bg-slate-100 disabled:opacity-45 rounded-lg flex items-center justify-center font-extrabold text-xs text-slate-600 border border-slate-200 transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
                      >
                        -
                      </button>
                      <input
                        id="sidebar-lucky-input"
                        type="number"
                        min="1"
                        max={Math.max(1, filteredMembers.filter(m => m.selected !== false).length)}
                        value={luckyDrawCount}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          const activeCount = filteredMembers.filter(m => m.selected !== false).length;
                          if (!isNaN(val)) {
                            setLuckyDrawCount(Math.min(Math.max(1, activeCount || 1), Math.max(1, val)));
                          } else {
                            (e.target as any).value = '';
                          }
                        }}
                        onBlur={(e) => {
                          const val = parseInt(e.target.value, 10);
                          const activeCount = filteredMembers.filter(m => m.selected !== false).length;
                          if (isNaN(val) || val < 1) {
                            setLuckyDrawCount(1);
                          } else {
                            setLuckyDrawCount(Math.min(Math.max(1, activeCount || 1), val));
                          }
                        }}
                        className="w-10 sm:w-16 h-6 md:h-7 text-center font-black text-xs text-indigo-750 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all select-all bubble-input"
                      />
                      <button
                        type="button"
                        onClick={() => setLuckyDrawCount((prev) => Math.min(filteredMembers.filter(m => m.selected !== false).length, prev + 1))}
                        disabled={luckyDrawCount >= filteredMembers.filter(m => m.selected !== false).length}
                        className="w-6 h-6 md:w-7 md:h-7 bg-white hover:bg-slate-100 disabled:opacity-45 rounded-lg flex items-center justify-center font-extrabold text-xs text-slate-600 border border-slate-200 transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
                      >
                        +
                      </button>
                    </div>
                  )}

                  {/* Tiny shuffling button */}
                  <button
                    id="sidebar-action-shuffle"
                    onClick={triggerShuffle}
                    disabled={filteredMembers.filter(m => m.selected !== false).length === 0 || isShuffling}
                    className="h-8.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all cursor-pointer hover:scale-[1.02]"
                  >
                    <Shuffle className="w-3.5 h-3.5 text-emerald-300 animate-spin" style={{ animationDuration: '6s' }} />
                    <span>{drawType === 'group' ? '조 편성 시작' : '럭키 추첨 시작'}</span>
                  </button>
                </div>
              </div>

              {/* Collapsible Group Name Configuration Panel */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden transition-all text-left shrink-0">
                <button
                  type="button"
                  onClick={() => setIsNamingPanelExpanded(!isNamingPanelExpanded)}
                  className="w-full flex items-center justify-between p-3.5 px-4 text-left hover:bg-slate-50 transition-colors focus:outline-none cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="p-1 px-2.5 bg-indigo-50 border border-indigo-100 rounded-lg text-[10px] font-black text-indigo-600 animate-pulse">NEW</span>
                    <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-indigo-505 animate-spin" style={{ animationDuration: '4s' }} />
                      조 이름 사전 지정 및 작명 테마 설정
                    </span>
                  </div>
                  <span className="text-slate-400 text-xs font-bold transition-transform duration-300" style={{ transform: isNamingPanelExpanded ? 'rotate(180deg)' : 'none' }}>
                    ▼
                  </span>
                </button>

                {isNamingPanelExpanded && (
                  <div className="p-4 px-5 border-t border-slate-100 bg-slate-50/30 space-y-4">
                    {/* Mode selector */}
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 font-sans">작명 테마 방식 선택</span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        {[
                          { id: 'template_eng', label: '기본 (TEAM 01)' },
                          { id: 'template_kor', label: '한국형 (1조, 2조)' },
                          { id: 'theme_fruits', label: '🍏 과일 테마' },
                          { id: 'theme_animals', label: '🐯 동물 테마' },
                          { id: 'theme_gemstones', label: '💎 보석 테마' },
                          { id: 'custom', label: '✍️ 직접 입력' },
                        ].map((styleOption) => (
                          <button
                            key={styleOption.id}
                            type="button"
                            onClick={() => setGroupNamingStyle(styleOption.id)}
                            className={`py-1.5 px-2.5 rounded-lg text-center text-[11px] font-bold border transition-all cursor-pointer ${
                              groupNamingStyle === styleOption.id
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-black'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {styleOption.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom input panel */}
                    {groupNamingStyle === 'custom' && (
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">
                          지정할 조 이름 목록 입력
                        </label>
                        <input
                          id="input-custom-group-names"
                          type="text"
                          placeholder="쉼표(,)나 줄바꿈, 띄어쓰기로 구분: 예) 독수리조, 갈매기조, 제비조"
                          value={customGroupNamesStr}
                          onChange={(e) => setCustomGroupNamesStr(e.target.value)}
                          className="w-full text-xs text-slate-700 bg-white border border-slate-200 rounded-lg p-2 px-3 focus:outline-none focus:border-indigo-500 shadow-3xs transition-all font-sans"
                        />
                        <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                          * 조의 개수만큼 이름을 콤마(,)나 띄어쓰기 등으로 이어서 입력해 주세요. 이름이 작성되지 않은 조에는 숫자가 자동으로 매칭됩니다.
                        </p>
                      </div>
                    )}

                    {/* Dynamic Preview */}
                    <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0 font-sans">작명 설정 미리보기 ({groupCount}개 조):</span>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from({ length: groupCount }).map((_, i) => {
                          const frNames = ['사과조', '바나나조', '딸기조', '오렌지조', '포도조', '수박조', '멜론조', '체리조', '복숭아조', '파인애플조', '레몬조', '망고조'];
                          const anNames = ['사자조', '호랑이조', '독수리조', '곰조', '여우조', '토끼조', '판다조', '돌고래조', '펭귄조', '올빼미조', '늑대조', '다람쥐조'];
                          const gmNames = ['다이아몬드조', '루비조', '사파이어조', '에메랄드조', '진주조', '자수정조', '오팔조', '토파즈조', '가넷조', '아쿠아마린조'];

                          let previewVal = `TEAM ${String(i + 1).padStart(2, '0')}`;
                          if (groupNamingStyle === 'template_kor') {
                            previewVal = `${i + 1}조`;
                          } else if (groupNamingStyle === 'theme_fruits') {
                            previewVal = frNames[i % frNames.length];
                          } else if (groupNamingStyle === 'theme_animals') {
                            previewVal = anNames[i % anNames.length];
                          } else if (groupNamingStyle === 'theme_gemstones') {
                            previewVal = gmNames[i % gmNames.length];
                          } else if (groupNamingStyle === 'custom' && customGroupNamesStr.trim()) {
                            const customList = customGroupNamesStr
                              .split(/[,;\s\n]+/)
                              .map((n) => n.trim())
                              .filter((n) => n.length > 0);
                            if (customList[i]) {
                              previewVal = customList[i];
                            } else {
                              previewVal = `${i + 1}조`;
                            }
                          }

                          return (
                            <span key={i} className="px-2.5 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-black rounded-lg shadow-3xs">
                              {previewVal}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Futuristic interactive Shuffle style selector bar */}
              <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3 md:p-4 text-left select-none shadow-2xs shrink-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
                    <span className="text-xs font-extrabold text-slate-800">셔플 애니메이션 피버 스타일</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                    ※ 각 스타일별 특수 연출 효과를 제공합니다
                  </span>
                </div>
                
                <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-6 gap-2">
                  {[
                    { id: ShuffleStyle.ROULETTE, label: '클래식 룰렛', sub: 'Retro Flash', icon: RotateCcw, color: 'border-emerald-200/60 text-emerald-700 bg-emerald-50/20 hover:bg-emerald-50/60' },
                    { id: ShuffleStyle.MATRIX, label: '디지털 매트릭스', sub: 'Cyber Rain', icon: Sparkles, color: 'border-green-200/60 text-green-700 bg-green-50/20 hover:bg-green-50/60' },
                    { id: ShuffleStyle.SLOT_MACHINE, label: '슬롯 머신', sub: 'Jackpot Reels', icon: Layers, color: 'border-amber-200/60 text-amber-700 bg-amber-50/20 hover:bg-amber-50/60' },
                    { id: ShuffleStyle.VORTEX, label: '블랙홀 흡입', sub: 'Cosmic Vortex', icon: Shuffle, color: 'border-indigo-200/60 text-indigo-700 bg-indigo-50/20 hover:bg-indigo-50/60' },
                    { id: ShuffleStyle.CARD_DEAL, label: '카드 딜러', sub: 'Dealing Deal', icon: HelpCircle, color: 'border-rose-200/60 text-rose-750 bg-rose-50/20 hover:bg-rose-50/60' },
                    { id: ShuffleStyle.RANDOM, label: '무작위 믹스 🎲', sub: 'Surprise Style', icon: Users, color: 'border-purple-200/65 text-purple-750 bg-purple-50/20 hover:bg-purple-50/60' }
                  ].map((style) => {
                    const isSelected = selectedShuffleStyle === style.id;
                    const Icon = style.icon;
                    return (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => {
                          setSelectedShuffleStyle(style.id);
                          safeStorage.setItem('preferred_shuffle_style', style.id);
                        }}
                        className={`p-2 rounded-xl border flex flex-col items-center justify-center text-center transition-all cursor-pointer relative overflow-hidden group active:scale-95 ${
                          isSelected
                            ? 'bg-slate-900 border-slate-950 text-white shadow-sm ring-2 ring-indigo-500/20'
                            : `${style.color}`
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 mb-1 transition-transform ${isSelected ? 'text-indigo-400 rotate-12' : 'text-slate-500 group-hover:scale-110'}`} />
                        <span className="text-[11px] font-black block truncate max-w-full leading-tight">{style.label}</span>
                        <span className={`text-[8.5px] uppercase block tracking-wide font-bold scale-[0.9] mt-0.5 ${isSelected ? 'text-slate-350' : 'text-slate-400'}`}>
                          {style.sub}
                        </span>
                        {isSelected && (
                          <div className="absolute right-1 top-1 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Main Results Board */}
              <div id="main-results-board" className="flex-1 flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-1 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 select-none">
                      실시간 셔플 결과표 
                      <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-bold">
                        {departments.find(d => d.id === selectedDeptId)?.name || '현 부서'}
                      </span>
                      <span className="text-slate-400 font-normal text-xs">
                        {drawType === 'group' ? (
                          groups.length > 0 ? `— 총 ${groups.length}개 조 배정 완료` : '— 미편성 상태'
                        ) : (
                          luckyDrawWinners.length > 0 ? `— 총 ${luckyDrawWinners.length}명 당첨 완료` : '— 미추첨 상태'
                        )}
                      </span>
                    </h3>
                  </div>
                  
                  {((drawType === 'group' && groups.length > 0) || (drawType === 'lucky' && luckyDrawWinners.length > 0)) && (
                    <div className="flex flex-wrap gap-2 shrink-0">
                      {/* Redraw button */}
                      <button
                        id="btn-reset-groups"
                        onClick={() => {
                          if (drawType === 'group') {
                            setGroups([]);
                          } else {
                            setLuckyDrawWinners([]);
                          }
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100/80 border border-red-100 rounded-lg shadow-sm transition-all flex items-center gap-1 cursor-pointer"
                        title="결과를 완전 초기화하고 대기 상태로 되돌립니다."
                      >
                        <RotateCcw className="w-3 h-3 text-red-500" />
                        결과 초기화 (리셋)
                      </button>

                      <button
                        id="btn-reshuffle"
                        onClick={triggerShuffle}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-md hover:shadow-indigo-100 transition-all flex items-center gap-1 cursor-pointer"
                        title="현재 구성원 그대로 다시 무작위로 추첨을 진행합니다"
                      >
                        <Shuffle className="w-3 h-3" />
                        다시 추첨하기
                      </button>

                      <button
                        id="btn-copy-sidebar"
                        onClick={handleCopyResults}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm transition-all focus:outline-none flex items-center gap-1 cursor-pointer"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                            복사 완료!
                          </>
                        ) : (
                          <>
                            <Share2 className="w-3.5 h-3.5" />
                            결과 텍스트 복사
                          </>
                        )}
                      </button>

                      <button
                        id="btn-capture-results"
                        type="button"
                        onClick={handleCaptureResults}
                        disabled={capturing}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 shadow-sm transition-all focus:outline-none flex items-center gap-1 cursor-pointer"
                        title="결과 영역 전체를 이미지 파일(.png)로 저장합니다."
                      >
                        {capturing ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0" />
                            <span>캡쳐 중...</span>
                          </>
                        ) : captured ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span>캡쳐 완료!</span>
                          </>
                        ) : (
                          <>
                            <Camera className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span>결과화면 캡쳐</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                <div id="shuffle-results-capture-area" className="flex-1 min-h-[350px] bg-slate-50/40 p-5 rounded-3xl border border-slate-200/60 shadow-[inset_0_2px_4px_rgba(0,0,0,0.015)]">
                  {drawType === 'group' ? (
                    groups.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {groups.map((group, groupIdx) => (
                          <motion.div
                            key={group.id}
                            initial={{ opacity: 0, scale: 0.96, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            transition={{ duration: 0.35, delay: groupIdx * 0.06 }}
                            className="bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all p-5 flex flex-col h-full overflow-hidden"
                          >
                            {/* Header bar of Team block */}
                            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                              <div className="flex-1 min-w-0">
                                <input
                                  type="text"
                                  value={group.name}
                                  onChange={(e) => handleRenameGroup(group.id, e.target.value)}
                                  className="w-full text-indigo-600 font-bold text-sm bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-500 focus:outline-none px-1 rounded transition-all truncate"
                                  title="더블클릭하여 조 이름 수정"
                                />
                              </div>
                              <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0">
                                {group.members.length} Members
                              </span>
                            </div>

                            {/* Member pictures grid */}
                            <div className="grid grid-cols-4 gap-3">
                              {group.members.map((member, mIdx) => (
                                <div key={member.id} className="space-y-1.5 text-center relative group">
                                  <div className="w-full aspect-square bg-slate-100 rounded-lg overflow-hidden border border-slate-100 shadow-sm relative flex items-center justify-center">
                                    {member.photoUrl ? (
                                      <img
                                        src={member.photoUrl}
                                        alt={member.name}
                                        referrerPolicy="no-referrer"
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                      />
                                    ) : (
                                      <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center font-black text-[10px] sm:text-xs px-1 text-center group-hover:scale-105 transition-transform duration-200 break-all leading-tight select-none">
                                        {member.name || '?'}
                                      </div>
                                    )}
                                    {mIdx === 0 && (
                                      <div className="absolute top-1 left-1 bg-amber-400 text-white p-0.5 rounded-md shadow-sm" title="대표조장">
                                        <Crown className="w-3 h-3 text-white" />
                                      </div>
                                    )}
                                  </div>
                                  
                                  <div className="px-0.5">
                                    {member.photoUrl && (
                                      <p className="text-[10px] font-bold text-slate-800 truncate leading-tight">
                                        {member.name}
                                      </p>
                                    )}
                                    <p className="text-[8px] text-slate-400 truncate leading-none mt-0.5">
                                      {mIdx === 0 ? '대표조장 👑' : '팀원'}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      /* Elegant Empty Placeholder grid */
                      <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center flex flex-col items-center justify-center min-h-[360px] h-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.01)]">
                        <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500 mb-4 animate-float shadow-inner">
                          <Layers className="w-7 h-7" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 mb-1">편성된 조 목록이 비어있습니다</h3>
                        <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed select-none">
                          추첨 후보 인원 셋업이 끝나셨다면, 상단 제어 바에서 조 개수를 선택하시고 &lsquo;셔플 가동&rsquo;을 눌러 결과를 확인해보세요!
                        </p>
                        
                        <div className="flex gap-3">
                          <button
                            onClick={() => setActiveStep(1)}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                          >
                            ⬅ 부서원 수정하러 돌아가기
                          </button>
                          <button
                            onClick={triggerShuffle}
                            disabled={filteredMembers.filter(m => m.selected !== false).length === 0}
                            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all"
                          >
                            무작위 추첨 시작하기 🎲
                          </button>
                        </div>
                      </div>
                    )
                  ) : (
                    /* Lucky Draw mode result */
                    luckyDrawWinners.length > 0 ? (
                      <div className="flex flex-col gap-6">
                        {/* Summary / Subtitle banner */}
                        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 rounded-3xl p-6 text-center shadow-sm relative overflow-hidden select-none">
                          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-200/20 rounded-full blur-2xl -mr-8 -mt-8" />
                          <div className="text-amber-500 font-bold text-3xl mb-1.5 flex justify-center gap-1">🏆</div>
                          <h4 className="text-base font-extrabold text-amber-900">당첨을 진심으로 축하합니다!</h4>
                          <p className="text-xs text-amber-700/80 mt-1">엄격하고 공정한 럭키 무작위 셔플을 통해 최종 선발된 당첨자 명단입니다.</p>
                        </div>

                        {/* Winners Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                          {luckyDrawWinners.map((winner, idx) => (
                            <motion.div
                              key={winner.id}
                              initial={{ opacity: 0, scale: 0.9, y: 20 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              transition={{ type: 'spring', stiffness: 260, damping: 20, delay: idx * 0.1 }}
                              className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-all flex flex-col items-center text-center relative group overflow-hidden"
                            >
                              {/* Winner Rank Badge */}
                              <div className="absolute top-2.5 left-2.5 bg-gradient-to-r from-amber-400 to-amber-500 text-white font-black text-[10px] px-2.5 py-1 rounded-full shadow-sm">
                                당첨 {idx + 1}순위
                              </div>

                              <div className="w-24 h-24 bg-slate-100 rounded-2xl overflow-hidden border-2 border-amber-300 shadow-md relative flex items-center justify-center mt-4 mb-3 shrink-0">
                                {winner.photoUrl ? (
                                  <img
                                    src={winner.photoUrl}
                                    alt={winner.name}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center font-black text-sm px-2 text-center group-hover:scale-105 transition-transform duration-200 break-all leading-tight select-none">
                                    {winner.name || '?'}
                                  </div>
                                )}
                              </div>

                              <div className="w-full">
                                {winner.photoUrl && (
                                  <h5 className="font-extrabold text-slate-800 text-sm truncate">
                                    {winner.name}
                                  </h5>
                                )}
                                <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wide">
                                  {winner.role || '팀원'}
                                </p>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      /* Elegant Empty Placeholder grid for Lucky Draw */
                      <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center flex flex-col items-center justify-center min-h-[360px] h-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.01)]">
                        <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 mb-4 animate-float shadow-inner">
                          <Gift className="w-7 h-7" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 mb-1">선택된 럭키 당첨자가 없습니다</h3>
                        <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed select-none">
                          추첨 후보 인원 셋업이 끝나셨다면, 상단 제어 바에서 럭키 추첨 모드를 선택하시고 &lsquo;셔플 가동&rsquo;을 눌러 행운의 당첨자를 확인해보세요!
                        </p>
                        
                        <div className="flex gap-3">
                          <button
                            onClick={() => setActiveStep(1)}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                          >
                            ⬅ 부서원 수정하러 돌아가기
                          </button>
                          <button
                            onClick={triggerShuffle}
                            disabled={filteredMembers.filter(m => m.selected !== false).length === 0}
                            className="px-6 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all"
                          >
                            럭키 무작위 추첨 시작하기 🍀
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            </motion.div>
          ) : activeStep === 3 && appUser?.role === 'admin' ? (
            /* STEP 3 Screen window (User Permission Admin Panel) */
            <motion.div
              key="step3-window"
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 flex flex-col p-4 md:p-6 lg:p-8 gap-6 overflow-y-auto"
            >
              {/* Header Info Block */}
              <div id="admin-header-card" className="w-full bg-white border border-slate-200 rounded-3xl p-6 shadow-sm shrink-0">
                <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" />
                  <span>구글 로그인 및 최고 관리 권한 승인 센터</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-normal">
                  구글 Sign-In을 통해 시스템에 로그인 기록을 남긴 가입 대기자 및 일반 사용자들을 모니터링하고, 가입을 승인하거나 관리자 권한을 부여할 수 있습니다. 최고관리자만이 접근이 허용되고 실시간으로 연동됩니다.
                </p>

                {/* Metric blocks */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-5">
                  <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 flex flex-col">
                    <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">전체 가입 계정</span>
                    <span className="text-xl font-extrabold text-slate-800 mt-1">{users.length} 명</span>
                  </div>
                  <div className="bg-amber-50/55 border border-amber-100 rounded-2xl p-4 flex flex-col">
                    <span className="text-[10px] text-amber-500 font-extrabold uppercase tracking-wider">승인 대기 중</span>
                    <span className="text-xl font-extrabold text-amber-600 mt-1">
                      {users.filter(u => !u.approved).length} 명
                    </span>
                  </div>
                  <div className="bg-indigo-50/55 border border-indigo-100 rounded-2xl p-4 flex flex-col col-span-2 sm:col-span-1">
                    <span className="text-[10px] text-indigo-500 font-extrabold uppercase tracking-wider">최고 관리자 수</span>
                    <span className="text-xl font-extrabold text-indigo-650 mt-1">
                      {users.filter(u => u.role === 'admin').length} 명
                    </span>
                  </div>
                </div>
              </div>

              {/* Users card collection list */}
              <div id="admin-user-list-card" className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex-1 overflow-hidden flex flex-col">
                <div className="text-xs font-extrabold text-slate-400 tracking-wider mb-4 uppercase">
                  등록 사용자 목록 ({users.length} 건)
                </div>

                <div className="flex-1 overflow-y-auto space-y-3.5 pr-2">
                  {users.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <Users className="w-8 h-8 text-slate-300 shrink-0 mb-2 animate-pulse" />
                      <p className="text-xs font-bold">등록된 사용자 정보가 비어있습니다.</p>
                    </div>
                  ) : (
                    users.map((target) => (
                      <div
                        key={target.uid}
                        id={`user-row-${target.uid}`}
                        className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border border-slate-150 rounded-2xl hover:bg-slate-50/45 transition-colors gap-4"
                      >
                        {/* Left User details structure */}
                        <div className="flex items-center gap-3">
                          <img
                            src={target.photoUrl || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&auto=format&fit=crop&q=80'}
                            alt={target.displayName}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-full border border-slate-200 shadow-xs"
                          />
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5 row-gap-1">
                              <span className="font-extrabold text-slate-850 text-sm">
                                {target.displayName}
                              </span>
                              {target.role === 'admin' ? (
                                <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-600">
                                  최고관리자
                                </span>
                              ) : (
                                <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                                  일반회원
                                </span>
                              )}
                              
                              {target.approved ? (
                                <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700">
                                  승인 완료
                                </span>
                              ) : (
                                <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 animate-pulse">
                                  가입 대기 중
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 font-medium mt-1 select-all">
                              {target.email}
                            </div>
                            <div className="text-[9px] text-slate-350 tracking-wide mt-0.5">
                              최초 가입 시간: {new Date(target.createdAt).toLocaleString('ko-KR')}
                            </div>
                          </div>
                        </div>

                        {/* Actions buttons */}
                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                          <button
                            id={`btn-approve-${target.uid}`}
                            onClick={() => handleToggleApproval(target)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                              target.approved
                                ? 'bg-amber-50 border-amber-100 text-amber-700 hover:bg-amber-100/50'
                                : 'bg-emerald-50 border-emerald-150 text-emerald-850 hover:bg-emerald-100/50'
                            }`}
                          >
                            {target.approved ? '승인 대기 상태로 전환' : '사용 승인하기'}
                          </button>

                          <button
                            id={`btn-role-${target.uid}`}
                            onClick={() => handleToggleRole(target)}
                            className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                          >
                            {target.role === 'admin' ? '일반회원으로 지정' : '최고관리자 지정'}
                          </button>

                          <button
                            id={`btn-delete-${target.uid}`}
                            onClick={() => handleDeleteUser(target.uid)}
                            className="px-3 py-1.5 bg-rose-50 border border-rose-100 hover:bg-rose-100/40 text-rose-650 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* 3. SLEEK SYSTEM FOOTER */}
      <footer id="footer-system" className="h-10 bg-slate-800 text-slate-400 px-8 flex items-center justify-between text-[10px] font-semibold shrink-0 z-10 uppercase tracking-wider select-none">
        <div>SYSTEM STATUS: READY TO SHUFFLE & EXPORT</div>
        <div className="flex gap-4 tracking-normal">
          <span>워크숍 분배 매니저 v4.6</span>
          <span className="hidden sm:inline text-slate-600">|</span>
          <span className="hidden sm:inline">ALGORITHM: RANDOM BALANCER CO-OP</span>
        </div>
      </footer>

      {/* 4. SHUFFLING INTENSE SUSPENSE MODAL */}
      <AnimatePresence>
        {isShuffling && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.94, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 15 }}
              className={`rounded-3xl shadow-2xl p-6 md:p-8 w-full border text-center relative overflow-hidden transition-all ${
                activeShuffleStyle === ShuffleStyle.MATRIX
                  ? 'bg-slate-950 border-green-500/40 text-green-400 max-w-sm'
                  : activeShuffleStyle === ShuffleStyle.SLOT_MACHINE
                  ? 'bg-slate-900 border-amber-500/40 text-slate-100 max-w-md md:max-w-lg'
                  : activeShuffleStyle === ShuffleStyle.VORTEX
                  ? 'bg-slate-900 border-indigo-500/40 text-indigo-50 max-w-sm'
                  : activeShuffleStyle === ShuffleStyle.CARD_DEAL
                  ? 'bg-slate-900 border-rose-500/40 text-rose-50 max-w-md'
                  : 'bg-white border-slate-150 text-slate-800 max-w-sm'
              }`}
            >
              {/* Top accent gradient border */}
              <div className={`absolute top-0 inset-x-0 h-1.5 ${
                activeShuffleStyle === ShuffleStyle.MATRIX
                  ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                  : activeShuffleStyle === ShuffleStyle.SLOT_MACHINE
                  ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500'
                  : activeShuffleStyle === ShuffleStyle.VORTEX
                  ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500'
                  : activeShuffleStyle === ShuffleStyle.CARD_DEAL
                  ? 'bg-gradient-to-r from-rose-500 to-pink-500'
                  : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500'
              }`} />
              
              <div className="space-y-6">
                {/* 1. Header with dynamic states and status icons */}
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                    activeShuffleStyle === ShuffleStyle.MATRIX
                      ? 'bg-green-950/45 text-green-400 border border-green-500/30'
                      : activeShuffleStyle === ShuffleStyle.SLOT_MACHINE
                      ? 'bg-amber-950/45 text-amber-400 border border-amber-400/30'
                      : activeShuffleStyle === ShuffleStyle.VORTEX
                      ? 'bg-indigo-950/45 text-indigo-400 border border-indigo-500/30'
                      : activeShuffleStyle === ShuffleStyle.CARD_DEAL
                      ? 'bg-rose-950/45 text-rose-400 border border-rose-500/30'
                      : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                  }`}>
                    {shufflePhase === 'completed' ? (
                      <Sparkles className="w-5 h-5 animate-pulse" />
                    ) : (
                      <RefreshCw className="w-5 h-5 animate-spin" style={{ animationDuration: '3s' }} />
                    )}
                  </div>

                  <div className="space-y-1 mt-1">
                    <h3 className={`text-base font-black tracking-tight ${
                      activeShuffleStyle === ShuffleStyle.MATRIX ? 'font-mono text-green-300' : ''
                    }`}>
                      {shufflePhase === 'preparing' && '조 정보 구성 및 통계 수집 중...'}
                      {shufflePhase === 'scrambling' && (
                        activeShuffleStyle === ShuffleStyle.MATRIX ? '디지털 코드 숲 셔플링...' :
                        activeShuffleStyle === ShuffleStyle.SLOT_MACHINE ? '잭팟 슬롯 활성 고속 드로우...' :
                        activeShuffleStyle === ShuffleStyle.VORTEX ? '소용돌이 블랙홀 중력 배정...' :
                        activeShuffleStyle === ShuffleStyle.CARD_DEAL ? 'Roster 카드 패 분배 시뮬레이션...' :
                        '카드를 고르게 섞는 중...'
                      )}
                      {shufflePhase === 'positioning' && '부서 배정 균등 매칭 밸런싱...'}
                      {shufflePhase === 'completed' && '🎉 조 편성 완료 / 완벽 동기화!'}
                    </h3>
                    <p className={`text-[11px] ${
                      activeShuffleStyle === ShuffleStyle.MATRIX ? 'text-green-500/60 font-mono' : 'text-slate-400'
                    }`}>
                      {activeShuffleStyle === ShuffleStyle.MATRIX ? 'ENCRYPTING RANDOM MATRIX STREAM' : '무작위 및 공평한 룰이 완벽 보장됩니다'}
                    </p>
                  </div>
                </div>

                {/* 2. Style-Specific Dynamic Render Playground */}
                <div className="my-5 relative">
                  
                  {/* STYLE A: CLASSIC ROULETTE */}
                  {activeShuffleStyle === ShuffleStyle.ROULETTE && (
                    <div className="space-y-5">
                      <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
                        <div className="absolute inset-0 rounded-full border-4 border-indigo-500/10 animate-ping" style={{ animationDuration: '2s' }} />
                        <div className="absolute inset-2 rounded-full border border-dashed border-indigo-400 rotate-slow animate-spin" style={{ animationDuration: '8s' }} />
                        <div className="absolute inset-4 rounded-full border border-indigo-100/65" />
                        
                        <AnimatePresence mode="popLayout">
                          {activeShuffleMember && (
                            <motion.div
                              key={activeShuffleMember.id}
                              initial={{ scale: 0.6, rotate: -20, opacity: 0 }}
                              animate={{ scale: 1, rotate: 0, opacity: 1 }}
                              exit={{ scale: 1.4, rotate: 20, opacity: 0 }}
                              transition={{ duration: 0.12 }}
                              className="absolute"
                            >
                              {activeShuffleMember.photoUrl ? (
                                <img
                                  src={activeShuffleMember.photoUrl}
                                  alt={activeShuffleMember.name}
                                  referrerPolicy="no-referrer"
                                  className="w-22 h-22 rounded-full object-cover border-4 border-indigo-500 shadow-lg"
                                />
                              ) : (
                                <div className="w-22 h-22 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center font-bold text-sm border-4 border-indigo-500 shadow-lg select-none px-2 text-center break-all leading-tight">
                                  {activeShuffleMember.name || '?'}
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {activeShuffleMember && (
                        <motion.div
                          key={`det-${activeShuffleMember.id}`}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-center"
                        >
                          {activeShuffleMember.photoUrl && (
                            <span className="text-lg font-black text-slate-800">{activeShuffleMember.name}</span>
                          )}
                          <span className="text-[10px] ml-1 bg-indigo-50 text-indigo-700 border border-indigo-100/60 font-extrabold px-2 py-0.5 rounded-full inline-block">
                            {activeShuffleMember.role || '부서원'}
                          </span>
                        </motion.div>
                      )}
                    </div>
                  )}

                  {/* STYLE B: KEY MATRIX WATERFALL */}
                  {activeShuffleStyle === ShuffleStyle.MATRIX && (
                    <div className="h-44 w-full bg-black/95 border border-green-500/30 rounded-2xl relative overflow-hidden flex items-center justify-center">
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-green-500/10 to-transparent pointer-events-none" style={{ animation: 'cyber-scan 5s linear infinite' }} />
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_50%,rgba(0,0,0,0.85)_100%)] pointer-events-none" />
                      
                      <div className="absolute inset-0 flex justify-between px-2 text-[8px] font-mono select-none opacity-40 pointer-events-none">
                        {Array.from({ length: 12 }).map((_, colIdx) => (
                          <span
                            key={colIdx}
                            className="text-green-500/80 leading-none h-full block animate-matrix-green"
                            style={{
                              '--fall-duration': `${1.8 + Math.random() * 2.2}s`,
                              writingMode: 'vertical-rl',
                              animationDelay: `${colIdx * 0.12}s`
                            } as any}
                          >
                            {Array.from({ length: 15 }).map(() => '0101SHFL정예멤버당첨자'[Math.floor(Math.random() * 12)]).join('')}
                          </span>
                        ))}
                      </div>

                      <AnimatePresence mode="popLayout">
                        {activeShuffleMember ? (
                          <motion.div
                            key={`m-${activeShuffleMember.id}`}
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 1.25, opacity: 0 }}
                            transition={{ duration: 0.1 }}
                            className="relative z-10 flex flex-col items-center"
                          >
                            {activeShuffleMember.photoUrl ? (
                              <img
                                src={activeShuffleMember.photoUrl}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="w-20 h-20 rounded-lg object-cover border-2 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.65)]"
                              />
                            ) : (
                              <div className="w-20 h-20 rounded-lg bg-slate-900 text-green-400 border-2 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.65)] flex items-center justify-center font-bold text-xs select-none px-1 text-center break-all leading-tight">
                                {activeShuffleMember.name || '?'}
                              </div>
                            )}
                            <span className="text-xs font-black tracking-widest text-green-400 bg-slate-950/90 border border-green-500/50 px-3 py-1 rounded-md mt-3 font-mono">
                               {activeShuffleMember.photoUrl ? `${activeShuffleMember.name} ` : ''}(ID: {activeShuffleMember.id.substr(0,4)})
                            </span>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* STYLE C: JACKPOT REEL SLOT MACHINE */}
                  {activeShuffleStyle === ShuffleStyle.SLOT_MACHINE && (
                    <div className="bg-slate-950 border-2 border-amber-400 rounded-2xl p-4 shadow-[0_0_20px_rgba(245,158,11,0.2)] relative overflow-hidden">
                      <div className="absolute top-1 inset-x-0 flex justify-center gap-1">
                        <div className="w-1 h-1 bg-amber-400 rounded-full animate-ping" />
                        <span className="text-[9px] font-black text-amber-300 font-mono px-2 uppercase tracking-wide">SHUFFLE REELS</span>
                        <div className="w-1 h-1 bg-amber-400 rounded-full animate-ping" style={{ animationDelay: '0.3s' }} />
                      </div>

                      <div className="grid grid-cols-4 gap-2 mt-4.5">
                        {slotMachineReels.slice(0, 4).map((reelList, rIdx) => {
                          const isSpinning = shufflePhase === 'scrambling' || shufflePhase === 'preparing';
                          // Standard reel index cycling based on date
                          const targetDisplayIdx = (rIdx + 2) % reelList.length;
                          const displayMember = reelList[targetDisplayIdx] || activeShuffleMember;
                          return (
                            <div key={rIdx} className="h-28 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden relative flex flex-col justify-center items-center">
                              {isSpinning ? (
                                <div 
                                  className="w-full absolute inset-x-0 flex flex-col gap-2" 
                                  style={{
                                    animation: 'slot-shl-spin 0.4s linear infinite',
                                    animationDelay: `${rIdx * 0.08}s`
                                  }}
                                >
                                  {reelList.map((m, idx) => (
                                    <div key={idx} className="flex flex-col items-center gap-1 opacity-45">
                                      {m.photoUrl ? (
                                        <img src={m.photoUrl} alt="" className="w-6 h-6 rounded-full border border-slate-700 object-cover" />
                                      ) : (
                                        <div className="w-6 h-6 rounded-full border border-slate-700 bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[6px] select-none px-0.5 text-center break-all leading-tight">
                                          {m.name || '?'}
                                        </div>
                                      )}
                                      {m.photoUrl && (
                                        <span className="text-[7.5px] text-slate-400 truncate w-11 font-bold">{m.name}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <motion.div
                                  initial={{ y: -40, opacity: 0, scale: 0.6 }}
                                  animate={{ y: 0, opacity: 1, scale: 1 }}
                                  transition={{ type: 'spring', damping: 12, stiffness: 150, delay: rIdx * 0.12 }}
                                  className="flex flex-col items-center gap-1 relative z-10 p-1"
                                >
                                  {displayMember && (
                                    <>
                                      {displayMember.photoUrl ? (
                                        <img 
                                          src={displayMember.photoUrl} 
                                          alt="" 
                                          className="w-10 h-10 rounded-full border border-amber-400 shadow-md object-cover" 
                                        />
                                      ) : (
                                        <div className="w-10 h-10 rounded-full border border-amber-400 bg-slate-800 text-amber-350 shadow-md flex items-center justify-center font-bold text-[8px] select-none px-1 text-center break-all leading-tight">
                                          {displayMember.name || '?'}
                                        </div>
                                      )}
                                      {displayMember.photoUrl && (
                                        <span className="text-[10px] font-black text-amber-200 truncate w-14 block text-center">{displayMember.name}</span>
                                      )}
                                      <span className="text-[7px] text-slate-400 truncate w-14 block text-center font-bold">배정확정</span>
                                    </>
                                  )}
                                </motion.div>
                              )}
                              <div className="absolute inset-x-0 top-0 h-3 bg-linear-to-b from-black/85 to-transparent pointer-events-none" />
                              <div className="absolute inset-x-0 bottom-0 h-3 bg-linear-to-t from-black/85 to-transparent pointer-events-none" />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* STYLE D: COSMIC ORBIT VORTEX */}
                  {activeShuffleStyle === ShuffleStyle.VORTEX && (
                    <div className="h-44 w-full bg-radial from-slate-900 to-indigo-950 rounded-2xl relative overflow-hidden flex items-center justify-center border border-indigo-900/55 shadow-[inset_0_0_20px_rgba(99,102,241,0.15)]">
                      <div className="absolute w-56 h-56 rounded-full border border-dashed border-indigo-500/10 animate-spin" style={{ animationDuration: '5s' }} />
                      <div className="absolute w-36 h-36 rounded-full border border-dashed border-purple-500/15 animate-spin" style={{ animationDuration: '9s', animationDirection: 'reverse' }} />
                      
                      {(shufflePhase === 'scrambling' || shufflePhase === 'preparing') && (
                        <div className="absolute inset-0 pointer-events-none overflow-hidden">
                          {vortexMiniMembers.map((m, idx) => (
                            <div
                              key={m.id}
                              className="absolute left-1/2 top-1/2 -ml-3 -mt-3 animate-custom-orbit"
                              style={{
                                '--orbit-duration': `${2.2 + (idx * 0.25)}s`,
                                animationDelay: `${idx * -0.15}s`
                              } as any}
                            >
                              {m.photoUrl ? (
                                <img
                                  src={m.photoUrl}
                                  alt=""
                                  className="w-6 h-6 rounded-full border border-indigo-400/40 opacity-70 shadow-xs object-cover"
                                />
                              ) : (
                                <div className="w-6 h-6 rounded-full border border-indigo-400/40 bg-indigo-900 text-white opacity-70 shadow-xs flex items-center justify-center font-bold text-[6px] select-none px-0.5 text-center break-all leading-tight">
                                  {m.name || '?'}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <AnimatePresence mode="popLayout">
                        {activeShuffleMember && (
                          <motion.div
                            key={`v-${activeShuffleMember.id}`}
                            initial={{ scale: 0.1, rotate: -180, opacity: 0 }}
                            animate={{ scale: 1, rotate: 0, opacity: 1 }}
                            exit={{ scale: 1.8, rotate: 180, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="absolute flex flex-col items-center"
                          >
                            {activeShuffleMember.photoUrl ? (
                              <img
                                src={activeShuffleMember.photoUrl}
                                alt=""
                                className="w-18 h-18 rounded-full border-2 border-indigo-400 shadow-xl object-cover"
                              />
                            ) : (
                              <div className="w-18 h-18 rounded-full border-2 border-indigo-400 bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-xl flex items-center justify-center font-bold text-xs select-none px-1.5 text-center break-all leading-tight">
                                {activeShuffleMember.name || '?'}
                              </div>
                            )}
                            {activeShuffleMember.photoUrl && (
                              <span className="text-[11px] font-black text-indigo-200 mt-2 block bg-indigo-950/80 px-2.5 py-0.5 rounded-full border border-indigo-500/30">
                                {activeShuffleMember.name}
                              </span>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* STYLE E: CARD DEAL CARD SHUFFLE */}
                  {activeShuffleStyle === ShuffleStyle.CARD_DEAL && (
                    <div className="h-44 w-full bg-slate-900 border border-slate-800 rounded-xl relative overflow-hidden flex items-center justify-between p-4 shadow-inner">
                      <div className="relative w-14 h-22 bg-slate-800/80 rounded-xl border border-rose-500/20 flex flex-col items-center justify-center shadow-md shrink-0">
                        <span className="text-[7.5px] font-black text-slate-400 uppercase rotate-90 truncate max-w-16">ROSTER DECK</span>
                        <div className="absolute -bottom-1 -right-1 w-full h-full bg-slate-850/60 rounded-xl border border-slate-800 pointer-events-none -z-10" />
                        <div className="absolute -bottom-2 -right-2 w-full h-full bg-slate-900/45 rounded-xl border border-slate-850 pointer-events-none -z-20" />
                      </div>

                      {shufflePhase === 'scrambling' && activeShuffleMember && (
                        <motion.div
                          key={`c-${activeShuffleMember.id}`}
                          initial={{ x: -160, y: 0, rotate: -15, scale: 0.7 }}
                          animate={{ x: 10, y: [0, -12, 0], rotate: [0, 10, 5], scale: 1 }}
                          exit={{ x: 120, y: 0, rotate: 20, scale: 0.6, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="absolute left-1/2 -ml-10 w-20 h-28 bg-white text-slate-800 rounded-xl border-2 border-rose-500 shadow-xl flex flex-col justify-between p-2 z-20 overflow-hidden"
                        >
                          <span className="text-[7.5px] font-black text-rose-500 self-start">A</span>
                          {activeShuffleMember.photoUrl ? (
                            <img src={activeShuffleMember.photoUrl} alt="" className="w-10 h-10 rounded-lg object-cover mx-auto shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center font-bold text-[8px] mx-auto shrink-0 select-none px-1 text-center break-all leading-tight">
                              {activeShuffleMember.name || '?'}
                            </div>
                          )}
                          {activeShuffleMember.photoUrl && (
                            <span className="text-[9px] font-black text-slate-800 truncate text-center block mt-1">{activeShuffleMember.name}</span>
                          )}
                          <span className="text-[7.5px] font-black text-rose-500 self-end rotate-180">A</span>
                        </motion.div>
                      )}

                      <div className="flex flex-col gap-1 shrink-0">
                        <div className="text-[8.5px] font-bold text-rose-350 font-mono text-right uppercase tracking-[0.1em] mb-1">DELETING DECK</div>
                        <div className="flex gap-1.5">
                          {Array.from({ length: 3 }).map((_, idx) => (
                            <div key={idx} className="w-11 h-18 bg-slate-950 border border-slate-800 rounded-lg relative flex flex-col items-center justify-center shadow-inner shrink-0">
                              <span className="text-[7px] text-slate-500 font-bold mb-1">TEAM {idx + 1}</span>
                              {shufflePhase === 'scrambling' && (
                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" style={{ animationDelay: `${idx * 0.15}s` }} />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                </div>

                {/* 3. Global Loading State Indicator Bar */}
                <div className="w-full bg-slate-150/45 h-1.5 rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full ${
                      activeShuffleStyle === ShuffleStyle.MATRIX
                        ? 'bg-green-500'
                        : activeShuffleStyle === ShuffleStyle.SLOT_MACHINE
                        ? 'bg-amber-400'
                        : activeShuffleStyle === ShuffleStyle.VORTEX
                        ? 'bg-indigo-500'
                        : activeShuffleStyle === ShuffleStyle.CARD_DEAL
                        ? 'bg-rose-500'
                        : 'bg-indigo-600'
                    }`}
                    initial={{ width: '0%' }}
                    animate={{ 
                      width: shufflePhase === 'preparing' ? '25%' : 
                             shufflePhase === 'scrambling' ? '70%' : 
                             shufflePhase === 'positioning' ? '90%' : '100%' 
                    }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 5. ADD MEMBER MODAL POPUP */}
      <AnimatePresence>
        {isAddMemberModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4"
            onClick={() => setIsAddMemberModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl w-full max-w-sm relative z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-150">
                <span className="text-xs font-bold text-slate-700 tracking-tight flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-500" />
                  {editingMember ? '부서원 정보 수정' : '부서원 카드 추가'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddMemberModalOpen(false)}
                  className="w-6 h-6 hover:bg-slate-100 rounded-md flex items-center justify-center text-xs text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Renders the add/edit member form layout */}
              <AddMemberForm
                initialMember={editingMember}
                onAddMember={(newMeta) => {
                  handleAddMember(newMeta);
                }}
                onAddMembers={(list) => {
                  handleAddMembers(list);
                }}
                onSaveMember={(id, updated) => {
                  handleUpdateMember(id, updated);
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 6. SYSTEM DEPARTMENT MODAL (ADD / EDIT) */}
      <AnimatePresence>
        {isDeptModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-4"
            onClick={() => setIsDeptModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl w-full max-w-md relative z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-slate-100">
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                  <Settings className="w-4 h-4 text-indigo-500" />
                  {editingDept ? '부서 정보 및 권한 수정' : '새로운 부서 생성 (부서 신설)'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsDeptModalOpen(false)}
                  className="w-6 h-6 hover:bg-slate-100 rounded-md flex items-center justify-center text-xs text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="dept-name" className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                    부서 이름
                  </label>
                  <input
                    id="dept-name"
                    type="text"
                    required
                    value={deptNameInput}
                    onChange={(e) => setDeptNameInput(e.target.value)}
                    placeholder="예: 마케팅 커뮤니케이션 본부, 전략 TF팀"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50/50"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="dept-pwd" className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                    관리 승인 비밀번호 (권한 증명)
                  </label>
                  <input
                    id="dept-pwd"
                    type="text"
                    value={deptPasswordInput}
                    onChange={(e) => setDeptPasswordInput(e.target.value)}
                    placeholder="미입력시 기본 1234로 지정됩니다"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50/50"
                  />
                  <p className="text-[9px] text-slate-400 leading-normal font-sans">
                    * 작성 및 지정을 시작한 관리인 본인만 부서원을 추가, 부서를 삭제, 편집 복구(Import)할 수 있도록 잠금용 검증 비밀번호를 마킹합니다.
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsDeptModalOpen(false)}
                    className="flex-1 py-2 bg-slate-50 border border-slate-200 hover:bg-slate-100/80 rounded-xl text-xs font-bold text-slate-550 transition-colors cursor-pointer"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={editingDept ? handleUpdateDepartment : handleCreateDepartment}
                    className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all hover:scale-[1.01]"
                  >
                    {editingDept ? '수정 사항 저장 및 검증' : '부서 생성 완료 🚀'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 7. SECURE PASSCODE AUTHORIZATION CHALLENGE MODAL */}
      <AnimatePresence>
        {isPasswordModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-4"
            onClick={() => setIsPasswordModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl w-full max-w-sm relative z-10 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto w-11 h-11 bg-amber-55 text-amber-600 rounded-full flex items-center justify-center border border-amber-100 bg-amber-50 mb-3">
                <Lock className="w-5 h-5 text-amber-500 fill-amber-50" />
              </div>

              <h3 className="text-sm font-black text-slate-800">
                부서 소유자 권한 비밀번호 검증
              </h3>
              <p className="text-[10px] text-slate-400 mt-1 max-w-xs mx-auto leading-normal">
                선택한 부서의 <strong>&lsquo;{departments.find(d => d.id === passwordTargetDeptId)?.name}&rsquo;</strong> 권한 확보가 필요합니다. 부서 생성 시 세팅한 비밀번호를 제공하십시오.
              </p>

              <div className="mt-4 space-y-3">
                <input
                  id="auth-pword-input"
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="비밀번호(암호) 입력 (기본: 1234)"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleVerifyPassword();
                  }}
                  className="w-full text-center px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm font-black bg-slate-50"
                  autoFocus
                />

                {passwordErrorMsg && (
                  <p className="text-[9px] text-red-500 font-bold leading-normal">
                    ⚠️ {passwordErrorMsg}
                  </p>
                )}

                <div className="flex gap-2 pt-1.5">
                  <button
                    type="button"
                    onClick={() => setIsPasswordModalOpen(false)}
                    className="flex-1 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleVerifyPassword}
                    className="flex-1 py-1.5 bg-indigo-650 hover:bg-indigo-700 bg-indigo-600 font-extrabold text-white rounded-xl text-xs transition-shadow shadow-sm active:scale-95 cursor-pointer"
                  >
                    권한 인증 승인
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 8. PWA INSTALL GUIDE MODAL */}
      <AnimatePresence>
        {isInstallGuideOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-md z-50 flex items-center justify-center p-4"
            onClick={() => setIsInstallGuideOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.45 }}
              className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-2xl w-full max-w-lg relative z-10 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Sparkle background accent */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl -z-10 pointer-events-none opacity-60" />
              
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-4 mb-5 pb-3 border-b border-slate-100">
                <div className="flex gap-3">
                  <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                    <img
                      src="/icon.svg"
                      alt="TeamShuffle Icon"
                      className="w-8 h-8 object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
                      TeamShuffle 홈 화면 앱 추가
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">매일 한 번의 터치로 간편하게 스마트폰 앱으로 사용하세요!</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsInstallGuideOpen(false)}
                  className="w-6 h-6 hover:bg-slate-100 rounded-md flex items-center justify-center text-xs text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Grid with Platform instructions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
                {/* iPhone / iOS / Safari Column */}
                <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full inline-block mb-2">
                       iPhone / Safari
                    </span>
                    <ul className="space-y-2.5 text-xs text-slate-600 font-medium">
                      <li className="flex gap-2">
                        <span className="w-5 h-5 bg-white border border-slate-200 rounded-full flex items-center justify-center font-bold text-[10px] text-slate-700 shrink-0">1</span>
                        <span>사파리(Safari) 브라우저 하단 중앙의 <strong>공유 버튼 <span className="text-indigo-600 font-bold">⎋</span></strong>을 터치합니다.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="w-5 h-5 bg-white border border-slate-200 rounded-full flex items-center justify-center font-bold text-[10px] text-slate-700 shrink-0">2</span>
                        <span>메뉴를 아래로 내려 <strong>'홈 화면에 추가'</strong> 항목을 선택합니다.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="w-5 h-5 bg-white border border-slate-200 rounded-full flex items-center justify-center font-bold text-[10px] text-slate-700 shrink-0">3</span>
                        <span>상단 우측의 <strong>'추가'</strong> 버튼을 클릭하면 바탕화면에 설치됩니다!</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Android / Chrome Column */}
                <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full inline-block mb-2">
                      🤖 Android / Chrome
                    </span>
                    <ul className="space-y-2.5 text-xs text-slate-600 font-medium">
                      <li className="flex gap-2">
                        <span className="w-5 h-5 bg-white border border-slate-200 rounded-full flex items-center justify-center font-bold text-[10px] text-slate-700 shrink-0">1</span>
                        <span>위 항목의 <strong>'앱 설치'</strong> 버튼을 터치하거나 주소창의 더보기 <strong>(⋮) 아이콘</strong>을 클릭합니다.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="w-5 h-5 bg-white border border-slate-200 rounded-full flex items-center justify-center font-bold text-[10px] text-slate-700 shrink-0">2</span>
                        <span>안내 메뉴 중 <strong>'앱 설치'</strong> 혹은 <strong>'홈 화면에 추가'</strong>를 선택합니다.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="w-5 h-5 bg-white border border-slate-200 rounded-full flex items-center justify-center font-bold text-[10px] text-slate-700 shrink-0">3</span>
                        <span>자동 설치가 완료되고, 부서원 명단이 오프라인 상태에서도 작동합니다!</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Bottom footer notice */}
              <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-bold">
                <span className="flex items-center gap-1">
                  ⚡ 오프라인 완전 대응 / 0.1초 이내 초고속 구동
                </span>
                <button
                  onClick={() => setIsInstallGuideOpen(false)}
                  className="px-4 py-1.5 bg-slate-900 text-white rounded-xl text-xs hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  확인 완료
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
