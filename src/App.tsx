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
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Member, Group, Department, AppUser } from './types';
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
  writeBatch
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth, loginWithGoogle, loginWithGoogleRedirect, logout, authenticateApp, testConnection, handleFirestoreError, OperationType, getLoadedFirebaseConfig, saveCustomFirebaseConfig } from './firebase';

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Helper to wrap Firestore Promises with an absolute timeout limit (2.5 seconds) to prevent infinite pending locks
function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 2500): Promise<T> {
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

export default function App() {
  // Authentication States
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showDomainSettings, setShowDomainSettings] = useState<boolean>(false);
  const [showFirebaseSettings, setShowFirebaseSettings] = useState<boolean>(false);
  const [configStatus, setConfigStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showConfigConfirmReset, setShowConfigConfirmReset] = useState<boolean>(false);
  const [customConfigInput, setCustomConfigInput] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('CUSTOM_FIREBASE_CONFIG');
      if (stored) {
        try {
          return JSON.stringify(JSON.parse(stored), null, 2);
        } catch {
          return stored;
        }
      }
    }
    return '';
  });
  const [users, setUsers] = useState<AppUser[]>([]);

  // Departments State
  const [departments, setDepartments] = useState<Department[]>(() => {
    const saved = localStorage.getItem('dept_departments');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return []; }
    }
    return [];
  });
  
  // Selected department ID
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(() => {
    return localStorage.getItem('selected_dept_id') || null;
  });

  // Members State
  const [members, setMembers] = useState<Member[]>(() => {
    const saved = localStorage.getItem('dept_members');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return []; }
    }
    return [];
  });

  // Unlocked department IDs (session-based cache for password authorization)
  const [unlockedDepts, setUnlockedDepts] = useState<string[]>([]);

  // Offline or online states
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(() => {
    return localStorage.getItem('force_offline_mode') === 'true';
  });
  const [isDbLoading, setIsDbLoading] = useState<boolean>(() => {
    return localStorage.getItem('force_offline_mode') !== 'true';
  });

  // Navigation active steps: 1 = Member setup / 2 = Shuffling & Results / 3 = Users Management (Admin)
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  // Group size controls
  const [groupCount, setGroupCount] = useState<number>(3);
  const [groups, setGroups] = useState<Group[]>([]);
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
  const [copied, setCopied] = useState(false);
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

  // Monitor auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setCurrentUser(firebaseUser);
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        
        try {
          const userSnap = await getDoc(userDocRef);
          if (!userSnap.exists()) {
            const now = new Date().toISOString();
            const emailLower = (firebaseUser.email || '').toLowerCase();
            const isSuperAdminEmail = emailLower === 'gukhyunglee@gmail.com';
            
            const initialUserRecord: AppUser = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || '사용자',
              photoUrl: firebaseUser.photoURL || '',
              approved: isSuperAdminEmail,
              role: isSuperAdminEmail ? 'admin' : 'user',
              createdAt: now,
              updatedAt: now
            };
            await setDoc(userDocRef, initialUserRecord);
            setAppUser(initialUserRecord);
          } else {
            setAppUser(userSnap.data() as AppUser);
          }
        } catch (err) {
          console.error('Error fetching/creating user profile:', err);
        }

        const unsubUserSnap = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            setAppUser(docSnap.data() as AppUser);
          }
        }, (err) => {
          console.error('User snapshot error:', err);
        });

        setIsAuthLoading(false);
        return () => {
          unsubUserSnap();
        };
      } else {
        setCurrentUser(null);
        setAppUser(null);
        setIsAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

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
      await logout();
      setCurrentUser(null);
      setAppUser(null);
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const handleSaveFirebaseConfig = () => {
    try {
      setConfigStatus(null);
      const cleanedInput = customConfigInput.trim();
      if (!cleanedInput) {
        setConfigStatus({ type: 'error', message: 'Firebase Config 내용을 입력해 주세요.' });
        return;
      }

      let parsed: any = null;

      // 1. Try standard JSON.parse first
      try {
        const directParsed = JSON.parse(cleanedInput);
        if (directParsed && typeof directParsed === 'object') {
          parsed = directParsed;
        }
      } catch (err) {
        // If strict JSON.parse fails, it is likely a JavaScript object literal pasted from the Firebase console.
        // We will fallback to a robust parser.
        console.log("Strict JSON parsing failed, attempting smart JS-Object parsing...");
      }

      // 2. If standard parsing didn't work (or didn't yield an object), do regex-based smart parsing
      if (!parsed) {
        const extracted: any = {};
        // Match both quoted and unquoted keys, e.g. apiKey: "value", "apiKey": 'value'
        const regex = /(["'`a-zA-Z0-9_]+)\s*:\s*["'`]([^"'`]+)["'`]/g;
        let match;
        
        while ((match = regex.exec(cleanedInput)) !== null) {
          const rawKey = match[1].replace(/["'`\s]/g, '');
          const value = match[2];
          const keyLower = rawKey.toLowerCase();
          
          if (keyLower === 'apikey') extracted.apiKey = value;
          else if (keyLower === 'authdomain') extracted.authDomain = value;
          else if (keyLower === 'projectid') extracted.projectId = value;
          else if (keyLower === 'storagebucket') extracted.storageBucket = value;
          else if (keyLower === 'messagingsenderid') extracted.messagingSenderId = value;
          else if (keyLower === 'appid') extracted.appId = value;
          else if (keyLower === 'measurementid') extracted.measurementId = value;
        }
        
        if (extracted.apiKey && extracted.projectId) {
          parsed = extracted;
        }
      }

      // 3. Fallback: line-by-line scanning if regex matched nothing
      if (!parsed) {
        const extracted: any = {};
        const lines = cleanedInput.split('\n');
        const knownKeys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];
        
        for (const line of lines) {
          for (const key of knownKeys) {
            const lowerKey = key.toLowerCase();
            if (line.toLowerCase().includes(lowerKey)) {
              // Get standard quotation content
              const quotes = line.match(/["'`]([^"'`]+)["'`]/g);
              if (quotes && quotes.length > 0) {
                // Find first non-key quote value
                for (const q of quotes) {
                  const val = q.replace(/["'`]/g, '').trim();
                  if (val !== key && val.toLowerCase() !== lowerKey) {
                    extracted[key] = val;
                    break;
                  }
                }
              }
            }
          }
        }
        
        // Handle lowercase appkey or apikey
        if (!extracted.apiKey) {
          for (const line of lines) {
            if (line.toLowerCase().includes('apikey') || line.toLowerCase().includes('appkey')) {
              const quotes = line.match(/["'`]([^"'`]+)["'`]/g);
              if (quotes) {
                for (const q of quotes) {
                  const val = q.replace(/["'`]/g, '').trim();
                  if (val.toLowerCase() !== 'apikey' && val.toLowerCase() !== 'appkey') {
                    extracted.apiKey = val;
                    break;
                  }
                }
              }
            }
          }
        }

        if (extracted.apiKey && extracted.projectId) {
          parsed = extracted;
        }
      }

      // Normalize key case format for saving (e.g. keyLower -> camelCase)
      if (parsed && typeof parsed === 'object') {
        const normalized: any = {};
        const keys = Object.keys(parsed);
        for (const k of keys) {
          const kl = k.toLowerCase();
          if (kl === 'apikey') normalized.apiKey = parsed[k];
          else if (kl === 'authdomain') normalized.authDomain = parsed[k];
          else if (kl === 'projectid') normalized.projectId = parsed[k];
          else if (kl === 'storagebucket') normalized.storageBucket = parsed[k];
          else if (kl === 'messagingsenderid') normalized.messagingSenderId = parsed[k];
          else if (kl === 'appid') normalized.appId = parsed[k];
          else if (kl === 'measurementid') normalized.measurementId = parsed[k];
          else normalized[k] = parsed[k];
        }
        parsed = normalized;
      }

      // 4. Validate
      if (!parsed || !parsed.apiKey || !parsed.projectId) {
        setConfigStatus({ 
          type: 'error', 
          message: '올바른 Firebase 설정 정보형식이 아닙니다. apiKey와 projectId가 정확히 포함되어 있는지 확인해 주세요.' 
        });
        return;
      }

      saveCustomFirebaseConfig(parsed);
      setConfigStatus({ 
        type: 'success', 
        message: '설정이 성공적으로 저장되었습니다! 적용을 위해 1초 후 화면이 자동으로 새로고침됩니다.' 
      });
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (e: any) {
      setConfigStatus({ type: 'error', message: '설정 파싱 또는 저장 중 오류가 발생했습니다: ' + e.message });
    }
  };

  const handleResetFirebaseConfig = () => {
    if (!showConfigConfirmReset) {
      setShowConfigConfirmReset(true);
      return;
    }
    saveCustomFirebaseConfig(null);
    setCustomConfigInput('');
    setShowConfigConfirmReset(false);
    setConfigStatus({ type: 'success', message: '기본 데모 설정으로 환원되었습니다! 적용을 위해 1초 후 화면이 자동으로 새로고침됩니다.' });
    setTimeout(() => {
      window.location.reload();
    }, 1200);
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
      localStorage.setItem('selected_dept_id', selectedDeptId);
    } else {
      localStorage.removeItem('selected_dept_id');
    }
  }, [selectedDeptId]);

  // Real-time Cloud Synchronization of Departments & Members
  useEffect(() => {
    if (!appUser || !appUser.approved) {
      setIsDbLoading(false);
      return;
    }

    if (localStorage.getItem('force_offline_mode') === 'true') {
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
      
      const savedDepts = localStorage.getItem('dept_departments');
      if (savedDepts) {
        try { setDepartments(JSON.parse(savedDepts)); } catch (e) { setDepartments([]); }
      }
      const savedMembers = localStorage.getItem('dept_members');
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

          syncDone = true;
          if (syncTimeout) {
            clearTimeout(syncTimeout);
            syncTimeout = null;
          }
          setIsOfflineMode(false);
          setIsDbLoading(false);
        }, (err) => {
          console.warn('Departments subscription blocked:', err);
          fallbackToOffline(err);
        });

        // 2. Snapshot for Members
        unsubscribeMembers = onSnapshot(membersRef, (memberSnap) => {
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
      localStorage.setItem('dept_departments', JSON.stringify(departments));
    }
    if (members.length > 0) {
      localStorage.setItem('dept_members', JSON.stringify(members));
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

    if (isOfflineMode) {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, selected: m.selected === false, updatedAt: new Date().toISOString() } : m
        )
      );
      return;
    }

    try {
      await withTimeout(updateDoc(doc(db, 'members', id), {
        selected: target.selected === false,
        updatedAt: new Date().toISOString(),
      }));
    } catch (err) {
      console.warn('Firestore toggle select failed:', err);
      setIsOfflineMode(true);
      setMembers((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, selected: m.selected === false, updatedAt: new Date().toISOString() } : m
        )
      );
    }
  };

  // Bulk Select / Deselect All for active department
  const handleToggleAll = async (select: boolean) => {
    if (!selectedDeptId) return;

    // We do not lock selection states with password since it is just utility config for Shuffle.
    if (isOfflineMode) {
      setMembers((prev) =>
        prev.map((m) =>
          m.departmentId === selectedDeptId ? { ...m, selected: select, updatedAt: new Date().toISOString() } : m
        )
      );
      return;
    }

    try {
      const batch = writeBatch(db);
      filteredMembers.forEach((m) => {
        batch.update(doc(db, 'members', m.id), {
          selected: select,
          updatedAt: new Date().toISOString(),
        });
      });
      await withTimeout(batch.commit());
    } catch (err) {
      console.warn('Firestore bulk select failed:', err);
      setIsOfflineMode(true);
      setMembers((prev) =>
        prev.map((m) =>
          m.departmentId === selectedDeptId ? { ...m, selected: select, updatedAt: new Date().toISOString() } : m
        )
      );
    }
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

      if (isOfflineMode) {
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
        return;
      }

      try {
        await withTimeout(setDoc(doc(db, 'members', docId), {
          departmentId: selectedDeptId,
          name: newMeta.name,
          role: newMeta.role || '부서원',
          photoUrl: newMeta.photoUrl,
          selected: true,
          createdAt: isoNow,
          updatedAt: isoNow,
        }));
        setIsAddMemberModalOpen(false);
      } catch (err) {
        console.warn('Firestore add member failed:', err);
        setIsOfflineMode(true);
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
      }
    };

    checkPasswordAuth(selectedDeptId, action);
  };

  // Delete Member (Requires password verification check first)
  const handleDeleteMember = async (id: string) => {
    if (!selectedDeptId) return;

    const action = async () => {
      if (isOfflineMode) {
        setMembers((prev) => prev.filter((m) => m.id !== id));
        return;
      }

      try {
        await withTimeout(deleteDoc(doc(db, 'members', id)));
      } catch (err) {
        console.warn('Firestore delete failed:', err);
        setIsOfflineMode(true);
        setMembers((prev) => prev.filter((m) => m.id !== id));
      }
    };

    checkPasswordAuth(selectedDeptId, action);
  };

  // Update Member (Requires password verification check first)
  const handleUpdateMember = async (id: string, updated: Omit<Member, 'id' | 'selected'>) => {
    if (!selectedDeptId) return;

    const action = async () => {
      if (isOfflineMode) {
        setMembers((prev) =>
          prev.map((m) => (m.id === id ? { ...m, ...updated, updatedAt: new Date().toISOString() } : m))
        );
        setIsAddMemberModalOpen(false);
        return;
      }

      try {
        await withTimeout(updateDoc(doc(db, 'members', id), {
          name: updated.name,
          role: updated.role || '부서원',
          photoUrl: updated.photoUrl,
          updatedAt: new Date().toISOString(),
        }));
        setIsAddMemberModalOpen(false);
      } catch (err) {
        console.warn('Firestore update failed:', err);
        setIsOfflineMode(true);
        setMembers((prev) =>
          prev.map((m) => (m.id === id ? { ...m, ...updated, updatedAt: new Date().toISOString() } : m))
        );
        setIsAddMemberModalOpen(false);
      }
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

      // Prepare dev team vs strategy team default mapping
      const baseMembers = DEFAULT_MEMBERS.filter(m => {
        const isTech = ['m1', 'm3', 'm5', 'm7', 'm11'].includes(m.id);
        const isTargetTech = selectedDeptId === 'dept-tech';
        return isTech === isTargetTech;
      });

      if (isOfflineMode) {
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
        alert('이 브라우저 로컬 캐시 명단이 성공적으로 초기화되었습니다.');
        return;
      }

      try {
        const batch = writeBatch(db);
        
        // Delete only current department members
        filteredMembers.forEach((m) => {
          batch.delete(doc(db, 'members', m.id));
        });
        
        // Repopulate with allocated defaults
        baseMembers.forEach((m, idx) => {
          const mId = `custom-${selectedDeptId}-${m.id}-${Date.now()}`;
          const isoNow = new Date(Date.now() - idx * 1000).toISOString();
          batch.set(doc(db, 'members', mId), {
            departmentId: selectedDeptId,
            name: m.name,
            role: m.role || '부서원',
            photoUrl: m.photoUrl,
            selected: true,
            createdAt: isoNow,
            updatedAt: isoNow,
          });
        });

        await withTimeout(batch.commit());
        setGroups([]);
        alert('부서원 명단이 원격 클라우드에 성공적으로 리셋되었습니다!');
      } catch (err) {
        console.warn('Firestore reset failed:', err);
        setIsOfflineMode(true);
        alert('네트워크 또는 권한 비활성화로 로컬 수준에서만 복구 처리되었습니다.');
      }
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

      if (isOfflineMode) {
        setMembers((prev) => prev.filter((m) => m.departmentId !== selectedDeptId));
        setGroups([]);
        return;
      }

      try {
        const batch = writeBatch(db);
        filteredMembers.forEach((m) => {
          batch.delete(doc(db, 'members', m.id));
        });
        await withTimeout(batch.commit());
        setGroups([]);
      } catch (err) {
        console.warn('Firestore clear all failed:', err);
        setIsOfflineMode(true);
        setMembers((prev) => prev.filter((m) => m.departmentId !== selectedDeptId));
        setGroups([]);
      }
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
              if (isOfflineMode) {
                const updatedList = parsed.map((m, idx) => ({
                  ...m,
                  id: m.id || `custom-${selectedDeptId}-${Date.now()}-${idx}`,
                  departmentId: selectedDeptId,
                  createdAt: m.createdAt || new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }));

                setMembers(prev => [
                  ...prev.filter(m => m.departmentId !== selectedDeptId),
                  ...updatedList
                ]);
                alert(`성공적으로 ${parsed.length}명의 부서원을 불러왔습니다!`);
                setGroups([]);
                return;
              }

              try {
                const batch = writeBatch(db);
                
                // Delete active
                filteredMembers.forEach((m) => {
                  batch.delete(doc(db, 'members', m.id));
                });

                // Write loaded ones
                parsed.forEach((m, idx) => {
                  const mId = m.id || `custom-${selectedDeptId}-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`;
                  const isoNow = m.createdAt || new Date(Date.now() - idx * 1000).toISOString();
                  batch.set(doc(db, 'members', mId), {
                    departmentId: selectedDeptId,
                    name: m.name,
                    role: m.role || '부서원',
                    photoUrl: m.photoUrl || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=faces&q=80',
                    selected: m.selected !== false,
                    createdAt: isoNow,
                    updatedAt: m.updatedAt || isoNow,
                  });
                });

                await withTimeout(batch.commit());
                alert(`성공적으로 ${parsed.length}명의 부서원을 동기화하였습니다!`);
                setGroups([]);
              } catch (err) {
                console.warn('Firestore import backup failed:', err);
                setIsOfflineMode(true);
                alert('네트워크 유실로 임시 로컬 캐시에 백업 복원되었습니다.');
              }
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

  // Shuffle & Divide algorithm with step animations (Using filteredMembers instead of global members)
  const triggerShuffle = () => {
    const activeMembers = filteredMembers.filter((m) => m.selected !== false);

    if (filteredMembers.length === 0) {
      alert('조를 편성할 부서원이 없습니다. 부서원을 등록하거나 부서를 생성해주세요!');
      return;
    }
    if (activeMembers.length === 0) {
      alert('추첨(편성)에 참여할 부서원이 선택되지 않았습니다. 명단 목록에서 사진 왼쪽 체크박스를 활성화해주세요!');
      return;
    }
    if (groupCount < 1) {
      alert('최소 1개 이상의 조를 입력하셔야 합니다.');
      return;
    }

    const actualGroupCount = Math.min(groupCount, activeMembers.length);

    setIsShuffling(true);
    setActiveStep(2);
    setShufflePhase('preparing');
    
    let counter = 0;
    const intervalTime = 80;
    const totalFlashingTime = 1600;
    
    setTimeout(() => {
      setShufflePhase('scrambling');
      
      const flasher = setInterval(() => {
        const randomIdx = Math.floor(Math.random() * activeMembers.length);
        setActiveShuffleMember(activeMembers[randomIdx] as Member);
        counter += intervalTime;
        
        if (counter >= totalFlashingTime) {
          clearInterval(flasher);
          setShufflePhase('positioning');
          
          setTimeout(() => {
            const shuffled = shuffleArray<Member>(activeMembers);
            const generatedGroups: Group[] = Array.from({ length: actualGroupCount }, (_, i) => ({
              id: `g-${i + 1}`,
              name: `TEAM ${String(i + 1).padStart(2, '0')}`,
              members: [],
            }));

            shuffled.forEach((member, index) => {
              generatedGroups[index % actualGroupCount].members.push(member);
            });

            setGroups(generatedGroups);
            setShufflePhase('completed');
            
            setTimeout(() => {
              setIsShuffling(false);
              setShufflePhase('idle');
              setActiveShuffleMember(null);
            }, 800);
          }, 600);
        }
      }, intervalTime);
    }, 450);
  };

  // Rename a dynamic team group
  const handleRenameGroup = (groupId: string, newName: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, name: newName } : g))
    );
  };

  const handleCopyResults = () => {
    if (groups.length === 0) return;

    let resultText = `📋 [조 편성 결과]\n📅 편성 시간: ${new Date().toLocaleString('ko-KR')}\n\n`;
    groups.forEach((g) => {
      const memberNames = g.members.map((m) => `${m.name}(${m.role || '팀원'})`).join(', ');
      resultText += `🔸 ${g.name} (${g.members.length}명):\n   👉 ${memberNames || '배정인원 없음'}\n\n`;
    });
    resultText += `🎉 새로 짜인 조원들과 함께 최고의 성과를 내보세요! 🔥`;

    navigator.clipboard.writeText(resultText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans text-slate-900 select-none">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-150">
            <div className="w-6 h-6 border-3 border-white rounded-md"></div>
          </div>
          <h1 className="text-xl font-black tracking-tight text-slate-800 font-display">TeamShuffle</h1>
          <p className="text-xs text-slate-400 font-bold tracking-wider uppercase">보안 연결 및 사용자 정보 구성 중...</p>
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
            <div id="auth-error-alert" className="w-full bg-rose-50 border border-rose-100 rounded-2xl p-4 text-left flex gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5 animate-pulse" />
              <div className="flex-1">
                <span className="text-xs font-extrabold text-rose-900 leading-tight block">
                  로그인 차단 알림
                </span>
                <span className="text-[11px] text-rose-700 mt-1 block leading-relaxed break-all font-semibold">
                  {authError}
                </span>
              </div>
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

          {/* Authorized Domains settings instruction box for Administrator */}
          <div className="w-full border border-slate-150 rounded-2xl p-3 bg-slate-50/50 text-left">
            <button
              onClick={() => setShowDomainSettings(!showDomainSettings)}
              className="w-full flex items-center justify-between text-slate-500 hover:text-slate-700 transition-colors text-[11px] font-extrabold cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-indigo-500" />
                <span>관리자용 Firebase 승인 도메인 설정 안내</span>
              </span>
              {showDomainSettings ? (
                <ChevronUp className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              )}
            </button>

            {showDomainSettings && (
              <div className="mt-2 text-[10px] text-slate-500 leading-relaxed font-semibold flex flex-col gap-1.5 border-t border-slate-200/60 pt-2.5">
                <p>구글 로그인이 동작하기 위해서는 Firebase Authentication의 [승인된 도메인]에 현재 도메인이 등록되어 있어야 합니다.</p>
                <div className="bg-slate-100 p-2 rounded-lg flex flex-col gap-1 border border-slate-200 select-text">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-slate-400 font-extrabold tracking-wider uppercase">현재 도메인</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.hostname);
                        alert('도메인이 복사되었습니다: ' + window.location.hostname);
                      }}
                      className="text-indigo-600 hover:text-indigo-700 font-extrabold text-[9px] cursor-pointer flex items-center gap-0.5"
                    >
                      <Copy className="w-2.5 h-2.5" />
                      <span>복사</span>
                    </button>
                  </div>
                  <code className="text-[10px] font-mono text-indigo-650 mt-0.5 break-all">
                    {typeof window !== 'undefined' ? window.location.hostname : '현재 호스트명'}
                  </code>
                </div>
                <ol className="list-decimal pl-3.5 space-y-1 mt-1 text-slate-500">
                  <li>
                    <a
                      href="https://console.firebase.google.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline font-bold"
                    >
                      Firebase Console
                    </a>
                    에 접속합니다.
                  </li>
                  <li>해당 프로젝트의 <strong>Authentication</strong> 메뉴로 이동합니다.</li>
                  <li><strong>Settings</strong> 탭을 클릭한 뒤 <strong>Authorized domains</strong> 목록으로 이동합니다.</li>
                  <li><strong>Add domain</strong> 버튼을 클릭하여 위 복사한 도메인을 추가해 줍니다.</li>
                </ol>
              </div>
            )}
          </div>

          {/* Collapsible Custom Firebase SDK Settings */}
          <div className="w-full border border-slate-150 rounded-2xl p-3 bg-slate-50/50 text-left mt-2.5">
            <button
              onClick={() => setShowFirebaseSettings(!showFirebaseSettings)}
              className="w-full flex items-center justify-between text-slate-500 hover:text-slate-700 transition-colors text-[11px] font-extrabold cursor-pointer"
            >
              <span className="flex items-center gap-1.5 font-bold text-slate-600">
                <Settings className="w-3.5 h-3.5 text-emerald-500" />
                <span>개인 Firebase SDK 설정 연동 (간편 교체)</span>
              </span>
              {showFirebaseSettings ? (
                <ChevronUp className="w-3.5 h-3.5 shrink-0 text-slate-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
              )}
            </button>

            {showFirebaseSettings && (
              <div className="mt-2 text-[10px] text-slate-500 leading-relaxed font-semibold flex flex-col gap-2 border-t border-slate-200/60 pt-2.5">
                <p className="text-slate-500 leading-normal font-semibold">
                  발급받으신 Firebase 개인 프로젝트의 웹 앱 SDK 설정 JSON 객체를 붙여넣어, 현재 호스팅 설정을 손쉽게 갈아끼우고 연동하실 수 있습니다.
                </p>

                {/* Inline status notification */}
                {configStatus && (
                  <div className={`p-2.5 rounded-xl border text-[9.5px] font-bold leading-normal ${
                    configStatus.type === 'success' 
                      ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
                      : 'bg-rose-50 border-rose-100 text-rose-800'
                  }`}>
                    {configStatus.message}
                  </div>
                )}

                {/* Current Active Config Information Badge */}
                <div className="bg-slate-100/90 border border-slate-200 rounded-xl p-2 flex flex-col gap-1 shadow-2xs">
                  <span className="text-[9px] text-slate-400 font-extrabold tracking-wider uppercase">현재 연동 중인 프로젝트 ID</span>
                  <code className="text-[10px] font-mono text-indigo-700 font-extrabold break-all">
                    {getLoadedFirebaseConfig().projectId}
                  </code>
                </div>

                {/* JSON Textarea paste interface */}
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] text-slate-400 font-extrabold tracking-wider uppercase block">Firebase SDK 설정 JSON 객체</span>
                  <textarea
                    placeholder={`{
  "apiKey": "AIzaSy...",
  "authDomain": "...",
  "projectId": "...",
  "storageBucket": "...",
  "messagingSenderId": "...",
  "appId": "..."
}`}
                    value={customConfigInput}
                    onChange={(e) => {
                      setCustomConfigInput(e.target.value);
                      if (configStatus) setConfigStatus(null);
                    }}
                    rows={6}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-lg font-mono text-[9.5px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-3xs select-text focus:border-indigo-400 leading-normal"
                    style={{ whiteSpace: 'pre' }}
                  />
                </div>

                {/* Action buttons */}
                <div className="flex justify-between items-center mt-1 pt-1.5 border-t border-slate-100 gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleResetFirebaseConfig}
                      className={`px-2.5 py-1.5 rounded-lg text-[9.5px] font-extrabold transition-all cursor-pointer shadow-3xs border ${
                        showConfigConfirmReset 
                          ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700' 
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                      }`}
                    >
                      {showConfigConfirmReset ? '정말 되돌릴까요? (클릭하여 확인)' : '기본 설정으로 되돌리기'}
                    </button>
                    {showConfigConfirmReset && (
                      <button
                        onClick={() => setShowConfigConfirmReset(false)}
                        className="px-2 py-1.5 bg-white hover:bg-slate-50 text-slate-400 border border-slate-200 rounded-lg text-[9.5px] font-bold"
                      >
                        취소
                      </button>
                    )}
                  </div>
                  <button
                    onClick={handleSaveFirebaseConfig}
                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[9.5px] font-extrabold transition-all cursor-pointer shadow-3xs hover:scale-[1.01] active:scale-[0.99] shrink-0"
                  >
                    커스텀 설정 저장 및 적용
                  </button>
                </div>
              </div>
            )}
          </div>
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
              className="absolute inset-0 flex flex-col p-4 md:p-6 lg:p-8 gap-4 overflow-y-auto"
            >
              {/* Grid-based interactive department switcher card */}
              <div className="w-full bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-5 shadow-sm shrink-0">
                {/* Horizontal / Grid-friendly dynamic department list with lock/unlock overlays */}
                <div className="flex flex-wrap gap-2">
                  {/* Add Department Button integrated inside the grid */}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingDept(null);
                      setDeptNameInput('');
                      setDeptPasswordInput('');
                      setIsDeptModalOpen(true);
                    }}
                    className="px-3.5 py-3 rounded-2xl border border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/30 hover:bg-indigo-50/20 text-slate-600 hover:text-indigo-600 transition-all cursor-pointer flex items-center justify-center gap-1.5 min-w-[140px] md:min-w-[170px] select-none text-xs font-bold"
                  >
                    <Plus className="w-3.5 h-3.5 text-indigo-500" />
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
                        className={`px-3.5 py-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 min-w-[140px] md:min-w-[170px] select-none hover:shadow-xs relative ${
                          isActive
                            ? 'bg-indigo-50/70 border-indigo-200 shadow-sm'
                            : 'bg-slate-50/60 border-slate-200/80 hover:bg-slate-100/50 hover:border-slate-300'
                        }`}
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <h4 className={`text-xs font-black truncate ${isActive ? 'text-indigo-800' : 'text-slate-700'}`}>
                            {dept.name}
                          </h4>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] text-slate-400 font-bold">인원: {memberCount}명</span>
                            <span className="text-slate-300 text-[9px]">•</span>
                            <span className={`text-[9px] font-bold flex items-center gap-0.5 ${isUnlocked ? 'text-emerald-600' : 'text-slate-400'}`}>
                              {isUnlocked ? <Unlock className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                              {isUnlocked ? '편집인증' : '수정잠금'}
                            </span>
                          </div>
                        </div>

                        {/* Inline actions inside selected department cell */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingDept(dept);
                              setDeptNameInput(dept.name);
                              setDeptPasswordInput(dept.password);
                              setIsDeptModalOpen(true);
                            }}
                            className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-400 hover:text-indigo-600 transition-colors shadow-2xs"
                            title="부서 정보 및 권한 암호 수정"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteDepartment(dept.id);
                            }}
                            className="p-1 rounded bg-white hover:bg-red-50 border border-slate-200 text-slate-400 hover:text-red-500 transition-colors shadow-2xs"
                            title="이 부서 영구 삭제"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Full Width Integrated List & Controls Panel */}
              <div className="flex-1 w-full bg-white border border-slate-200 rounded-3xl shadow-sm p-6 sm:p-8 flex flex-col min-h-[400px]">
                {/* Minimized Panel Header: 1-line layout */}
                <div className="flex flex-row items-center justify-between gap-3 pb-3 border-b border-slate-150 shrink-0 select-none">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <h3 className="text-xs sm:text-sm font-black text-slate-800 flex items-center gap-1.5 shrink-0 select-none">
                      {departments.find(d => d.id === selectedDeptId)?.name || '선택된 부서'} 명단
                      <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded-md">
                        {filteredMembers.length}명
                      </span>
                    </h3>
                    <div className="hidden sm:flex items-center gap-2 text-[10px] text-slate-400 font-semibold select-none shrink-0">
                      <span className="text-indigo-600">참가 {filteredMembers.filter(m => m.selected !== false).length}명</span>
                      <span className="text-slate-300">|</span>
                      <span>제외 {filteredMembers.filter(m => m.selected === false).length}명</span>
                      <span className="text-slate-300">|</span>
                      {isDbLoading ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded flex items-center gap-1.5 font-bold">
                            <RefreshCw className="w-3 h-3 animate-spin text-amber-500" />
                            실시간 클라우드 연결 중...
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              localStorage.setItem('force_offline_mode', 'true');
                              setIsOfflineMode(true);
                              setIsDbLoading(false);
                            }}
                            className="bg-slate-250 hover:bg-slate-200 text-slate-705 px-1.5 py-0.5 rounded text-[9px] font-black cursor-pointer transition-colors"
                            title="데이터베이스 실시간 연결을 건너뛰고 브라우저 캐시 전용 오프라인 모드로 즉시 시작합니다."
                          >
                            오프라인 강제 전환
                          </button>
                        </div>
                      ) : isOfflineMode ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded flex items-center gap-1.5 font-bold">
                            <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse"></span>
                            로컬 오프라인 모드
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              localStorage.removeItem('force_offline_mode');
                              window.location.reload();
                            }}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-[9px] font-black cursor-pointer transition-colors"
                          >
                            클라우드 연결 시도
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-1.5 font-bold">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                            실시간 클라우드 동기화 완료
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              localStorage.setItem('force_offline_mode', 'true');
                              window.location.reload();
                            }}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[9px] font-black cursor-pointer transition-colors"
                          >
                            오프라인 전환
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleAll(true)}
                      className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100/70 text-indigo-700 text-[10px] font-extrabold rounded-lg transition-all cursor-pointer"
                    >
                      전체선택
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleAll(false)}
                      className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 text-[10px] font-extrabold rounded-lg transition-all cursor-pointer"
                    >
                      전체해제
                    </button>
                  </div>
                </div>

                {/* Highly compact Roster database Grid view with maximized density */}
                <div className="flex-1 overflow-y-auto py-2.5 minimal-scrollbar mt-1">
                  <AnimatePresence>
                    {filteredMembers.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
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
                      <div className="text-center py-16 text-slate-400">
                        <Users className="w-9 h-9 mx-auto opacity-30 mb-2 text-indigo-500" />
                        <p className="text-xs font-bold text-slate-500">이 부서에 등록된 부서원이 없습니다.</p>
                        <p className="text-[10px] text-slate-400 mt-1">아래의 등록 버튼을 클릭하여 소유자 비밀번호 검증 후 추가해주세요.</p>
                      </div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Compact Toolbar at Bottom - fitting fully on a single line with Backup & Restore supports */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-center gap-2 shrink-0 select-none">
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
                    className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-[11px] rounded-lg shadow-sm flex items-center gap-1 cursor-pointer transition-all hover:scale-[1.02]"
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-400" />
                    <span>팀원 등록</span>
                  </button>
                  <button
                    onClick={handleResetToDefault}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                    title="기본 데모 부서원 목록으로 되돌려 놓습니다."
                  >
                    <RotateCcw className="w-3 h-3 text-slate-500" />
                    <span>부서인원 리셋</span>
                  </button>
                  <button
                    onClick={handleClearAll}
                    className="px-3 py-1.5 bg-red-50 border border-red-100 text-red-600 hover:bg-red-100/70 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                    title="모든 인원을 비웁니다."
                  >
                    <Trash2 className="w-3 h-3 text-red-500" />
                    <span>부서원 전체비우기</span>
                  </button>

                  <span className="w-px h-4 bg-slate-200 hidden sm:inline" />

                  <button
                    onClick={handleExportBackup}
                    className="px-3 py-1.5 bg-indigo-50 border border-indigo-150 text-indigo-700 hover:bg-indigo-100/50 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                    title="부서원 명단을 안전하게 PC/스마트폰에 파일로 받아놓습니다."
                  >
                    <Download className="w-3 h-3 text-indigo-600" />
                    <span>명단 파일백업</span>
                  </button>
                  <button
                    onClick={() => document.getElementById('import-backup-file')?.click()}
                    className="px-3 py-1.5 bg-emerald-50 border border-emerald-150 text-emerald-850 hover:bg-emerald-100/50 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                    title="저장되었던 다운로드 파일(.json)을 불러와 복구합니다."
                  >
                    <Upload className="w-3 h-3 text-emerald-600" />
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

                  {/* Tiny shuffling button */}
                  <button
                    id="sidebar-action-shuffle"
                    onClick={triggerShuffle}
                    disabled={filteredMembers.filter(m => m.selected !== false).length === 0 || isShuffling}
                    className="h-8.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all cursor-pointer hover:scale-[1.02]"
                  >
                    <Shuffle className="w-3.5 h-3.5 text-emerald-300 animate-spin" style={{ animationDuration: '6s' }} />
                    <span>셔플 가동</span>
                  </button>
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
                        {groups.length > 0 ? `— 총 ${groups.length}개 조 배정 완료` : '— 미편성 상태'}
                      </span>
                    </h3>
                  </div>
                  
                  {groups.length > 0 && (
                    <div className="flex flex-wrap gap-2 shrink-0">
                      {/* Redraw button */}
                      <button
                        id="btn-reset-groups"
                        onClick={() => {
                          setGroups([]);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100/80 border border-red-100 rounded-lg shadow-sm transition-all flex items-center gap-1 cursor-pointer"
                        title="조 편성 결과를 완전 초기화하고 대기 상태로 되돌립니다."
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
                    </div>
                  )}
                </div>

                <div className="flex-1 min-h-[350px]">
                  {groups.length > 0 ? (
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
                                <div className="w-full aspect-square bg-slate-100 rounded-lg overflow-hidden border border-slate-100 shadow-sm relative">
                                  <img
                                    src={member.photoUrl}
                                    alt={member.name}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  />
                                  {mIdx === 0 && (
                                    <div className="absolute top-1 left-1 bg-amber-400 text-white p-0.5 rounded-md shadow-sm" title="대표조장">
                                      <Crown className="w-3 h-3 text-white" />
                                    </div>
                                  )}
                                </div>
                                
                                <div className="px-0.5">
                                  <p className="text-[10px] font-bold text-slate-800 truncate leading-tight">
                                    {member.name}
                                  </p>
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
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.94, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 15 }}
              className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full border border-slate-100 text-center relative overflow-hidden"
            >
              {/* Colorful gradient indicator */}
              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
              
              <div className="space-y-6">
                <div className="mx-auto w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                  <RefreshCw className="w-7 h-7 animate-spin" />
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-slate-800">
                    {shufflePhase === 'preparing' && '조 정보 취합 중...'}
                    {shufflePhase === 'scrambling' && '카드를 고르게 섞는 중...'}
                    {shufflePhase === 'positioning' && '팀 균등 분배 매칭 시뮬레이션...'}
                    {shufflePhase === 'completed' && '조 편성 배치 완료!'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    안전하고 무작위가 보장된 셔플링을 보장합니다
                  </p>
                </div>

                {/* Scrambling face display */}
                <div className="h-24 flex items-center justify-center relative">
                  <AnimatePresence mode="popLayout">
                    {activeShuffleMember && (
                      <motion.div
                        key={activeShuffleMember.id}
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 1.4, opacity: 0 }}
                        transition={{ duration: 0.1 }}
                        className="absolute flex flex-col items-center gap-1"
                      >
                        <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-indigo-500 shadow-md">
                          <img
                            src={activeShuffleMember.photoUrl}
                            alt={activeShuffleMember.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <span className="text-[11px] font-bold text-slate-600">
                          {activeShuffleMember.name} ({activeShuffleMember.role?.split('/')[0] || '부서원'})
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Visual loading bar */}
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-indigo-600"
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
