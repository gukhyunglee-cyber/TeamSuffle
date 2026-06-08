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
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Member, Group } from './types';
import { DEFAULT_MEMBERS } from './data/defaultMembers';
import AddMemberForm from './components/AddMemberForm';
import MemberItemCard from './components/MemberItemCard';

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function App() {
  // Members State (Initialized from localStorage or default list)
  const [members, setMembers] = useState<Member[]>(() => {
    const saved = localStorage.getItem('dept_members');
    if (saved) {
      try {
        return JSON.parse(saved) as Member[];
      } catch (e) {
        console.error('Failed to load saved members', e);
      }
    }
    return DEFAULT_MEMBERS;
  });

  // Navigation active steps: 1 = Member setup / 2 = Shuffling & Results
  const [activeStep, setActiveStep] = useState<1 | 2>(1);

  // PWA (Progressive Web App) states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBadge, setShowInstallBadge] = useState<boolean>(true);
  const [isInstallGuideOpen, setIsInstallGuideOpen] = useState(false);

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

    // Initial check for standalone mode
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
      // If native prompt is not available (such as on iOS or when using iframe), open the beautiful guide modal
      setIsInstallGuideOpen(true);
    }
  };

  // Group size controls
  const [groupCount, setGroupCount] = useState<number>(3);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  
  // Shuffling states
  const [isShuffling, setIsShuffling] = useState(false);
  const [shufflePhase, setShufflePhase] = useState<'idle' | 'preparing' | 'scrambling' | 'positioning' | 'completed'>('idle');
  const [activeShuffleMember, setActiveShuffleMember] = useState<Member | null>(null);
  const [copied, setCopied] = useState(false);

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('dept_members', JSON.stringify(members));
  }, [members]);

  // Adjust group count boundary if member size changes
  useEffect(() => {
    if (groupCount > Math.max(1, members.length)) {
      setGroupCount(Math.max(1, members.length));
    }
  }, [members.length, groupCount]);

  // Toggle Single Member Selected State
  const handleToggleSelect = (id: string) => {
    setMembers((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, selected: m.selected === false ? true : false } : m
      )
    );
  };

  // Bulk Select / Deselect All
  const handleToggleAll = (select: boolean) => {
    setMembers((prev) =>
      prev.map((m) => ({ ...m, selected: select }))
    );
  };

  // Add Member
  const handleAddMember = (newMeta: Omit<Member, 'id'>) => {
    const newMember: Member = {
      ...newMeta,
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      selected: true, // Default to true
    };
    setMembers((prev) => [newMember, ...prev]);
  };

  // Delete Member
  const handleDeleteMember = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  // Update Member
  const handleUpdateMember = (id: string, updated: Omit<Member, 'id' | 'selected'>) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updated } : m))
    );
  };

  // Reset to default roster list
  const handleResetToDefault = () => {
    if (window.confirm('부서원 명단을 처음에 제공된 기본 명단으로 초기화하시겠습니까? (추가하신 이력은 사라집니다)')) {
      setMembers(DEFAULT_MEMBERS);
      setGroups([]);
    }
  };

  // Clear all members
  const handleClearAll = () => {
    if (window.confirm('모든 부서원 명단을 삭제하시겠습니까?')) {
      setMembers([]);
      setGroups([]);
    }
  };

  // Export current list as a JSON file
  const handleExportBackup = () => {
    if (members.length === 0) {
      alert('내보낼 부서원 데이터가 없습니다.');
      return;
    }
    try {
      const dataStr = JSON.stringify(members, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `teamshuffle_members_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('백업 파일 내보내기에 실패했습니다.');
    }
  };

  // Import backup list from a JSON file
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const result = event.target?.result as string;
        const parsed = JSON.parse(result);
        if (Array.isArray(parsed)) {
          const isValid = parsed.every(p => typeof p === 'object' && p !== null && 'name' in p);
          if (isValid) {
            setMembers(parsed);
            alert(`성공적으로 ${parsed.length}명의 부서원을 불러왔습니다! 실시간 저장이 완료되었습니다.`);
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
    e.target.value = ''; // Reset input
  };

  // Shuffle & Divide algorithm with step animations (Filtering out deselected members)
  const triggerShuffle = () => {
    const activeMembers = members.filter((m) => m.selected !== false);

    if (members.length === 0) {
      alert('조를 편성할 부서원이 없습니다. 부서원을 추가해주세요!');
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
    setActiveStep(2); // Automatically swap to Step 2 window when executing draft
    setShufflePhase('preparing');
    
    // Cycle and animate cards of active members
    let counter = 0;
    const intervalTime = 80;
    const totalFlashingTime = 1600; // 1.6 seconds of intense flashing
    
    // Preparation phase lasts 400ms
    setTimeout(() => {
      setShufflePhase('scrambling');
      
      const flasher = setInterval(() => {
        const randomIdx = Math.floor(Math.random() * activeMembers.length);
        setActiveShuffleMember(activeMembers[randomIdx] as Member);
        counter += intervalTime;
        
        if (counter >= totalFlashingTime) {
          clearInterval(flasher);
          setShufflePhase('positioning');
          
          // Allocate groups using selected activeMembers only
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
            
            // Cleanup animation
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

  // Inline group title editing
  const handleRenameGroup = (groupId: string, newName: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, name: newName } : g))
    );
  };

  // Copy Results as Text to Clipboard
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 overflow-hidden select-none">
      
      {/* 1. TOP BRAND NAVIGATION BAR */}
      <nav id="nav-header" className="h-16 bg-white border-b border-slate-200 px-6 md:px-8 flex items-center justify-between shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-md shadow-indigo-100">
            <div className="w-4 h-4 border-2 border-white rounded-sm"></div>
          </div>
          <span className="font-extrabold text-xl tracking-tight text-slate-800 font-display">
            TeamShuffle
          </span>
        </div>

        {/* Dynamic Nav-based Step indicator */}
        <div className="flex flex-wrap items-center gap-2 select-none md:gap-3">
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
          <span className="text-slate-300 text-xs hidden sm:inline">➔</span>
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
        </div>
      </nav>

      {/* Main wizard body */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {activeStep === 1 ? (
            /* STEP 1 Screen window (Roster Data Setup) */
            <motion.div
              key="step1-window"
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 flex flex-col p-6 md:p-8 gap-6 overflow-y-auto"
            >
              {/* Full Width Integrated List & Controls Panel */}
              <div className="flex-1 max-w-6xl mx-auto w-full bg-white border border-slate-200 rounded-3xl shadow-sm p-6 sm:p-8 flex flex-col min-h-[400px]">
                {/* Minimized Panel Header: 1-line layout */}
                <div className="flex flex-row items-center justify-between gap-3 pb-3 border-b border-slate-150 shrink-0 select-none">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <h3 className="text-xs sm:text-sm font-black text-slate-800 flex items-center gap-1.5 shrink-0 select-none">
                      부서원 명단
                      <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded-md">
                        {members.length}명
                      </span>
                    </h3>
                    <div className="hidden sm:flex items-center gap-2 text-[10px] text-slate-450 font-semibold select-none shrink-0">
                      <span className="text-indigo-600">참가 {members.filter(m => m.selected !== false).length}명</span>
                      <span className="text-slate-300">|</span>
                      <span>제외 {members.filter(m => m.selected === false).length}명</span>
                      <span className="text-slate-300">|</span>
                      <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-1 font-bold">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                        브라우저 자동 저장됨
                      </span>
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
                    {members.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                        {members.map((member) => (
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
                        <p className="text-xs font-bold text-slate-500">등록된 부서원이 없습니다.</p>
                        <p className="text-[10px] text-slate-400 mt-1">아래의 등록 버튼을 클릭해 추가해 주세요.</p>
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
                    <span>등록</span>
                  </button>
                  <button
                    onClick={handleResetToDefault}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                    title="기본 데모 부서원 목록으로 되돌려 놓습니다."
                  >
                    <RotateCcw className="w-3 h-3 text-slate-500" />
                    <span>초기화</span>
                  </button>
                  <button
                    onClick={handleClearAll}
                    className="px-3 py-1.5 bg-red-50 border border-red-100 text-red-600 hover:bg-red-100/70 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                    title="모든 인원을 비웁니다."
                  >
                    <Trash2 className="w-3 h-3 text-red-500" />
                    <span>전체삭제</span>
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
          ) : (
            /* STEP 2 Screen window (Compact Top Settings & Wide Results map) */
            <motion.div
              key="step2-window"
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 flex flex-col p-6 md:p-8 gap-5 overflow-y-auto"
            >
              {/* Compact Minimized Top Control Card */}
              <div className="bg-white border border-slate-200 rounded-2xl p-2.5 px-4 shadow-sm flex flex-row items-center justify-between gap-3 shrink-0 transition-all">
                {/* Control Left: Single-line Navigation & small title */}
                <div className="flex items-center gap-2.5 truncate">
                  <button
                    onClick={() => setActiveStep(1)}
                    className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 font-bold transition-all cursor-pointer hover:underline shrink-0"
                    title="부서원 명단 편집하러 돌아가기"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"></path>
                    </svg>
                    <span>명단 편집</span>
                  </button>
                  <span className="text-slate-300 text-xs shrink-0">|</span>
                  <span className="text-xs font-bold text-slate-800 tracking-tight shrink-0">조 편성 및 추첨</span>
                  <span className="hidden sm:inline text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                    후보 {members.filter(m => m.selected !== false).length}명
                  </span>
                </div>

                {/* Control Right: Small input configuration & Instant shuffle button horizontally aligned */}
                <div className="flex items-center gap-3 shrink-0">
                  {/* Compact small group picker - PC에서는 크게, 모바일에서는 적절하게 */}
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1 px-3 md:p-1.5 md:px-5">
                    <span className="text-[11px] md:text-sm font-black text-slate-700 select-none">조 개수:</span>
                    <button
                      type="button"
                      onClick={() => setGroupCount((prev) => Math.max(1, prev - 1))}
                      disabled={groupCount <= 1}
                      className="w-6 h-6 md:w-9 md:h-9 bg-white hover:bg-slate-100 disabled:opacity-45 rounded-lg flex items-center justify-center font-extrabold text-xs md:text-base text-slate-600 border border-slate-200 transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
                    >
                      -
                    </button>
                    <input
                      id="sidebar-group-input"
                      type="number"
                      min="1"
                      max={Math.max(1, members.filter(m => m.selected !== false).length)}
                      value={groupCount}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        const activeCount = members.filter(m => m.selected !== false).length;
                        if (!isNaN(val)) {
                          setGroupCount(Math.min(Math.max(1, activeCount || 1), Math.max(1, val)));
                        } else {
                          // allow blank typing temporarily
                          (e.target as any).value = '';
                        }
                      }}
                      onBlur={(e) => {
                        const val = parseInt(e.target.value, 10);
                        const activeCount = members.filter(m => m.selected !== false).length;
                        if (isNaN(val) || val < 1) {
                          setGroupCount(3);
                        } else {
                          setGroupCount(Math.min(Math.max(1, activeCount || 1), val));
                        }
                      }}
                      className="w-10 sm:w-16 md:w-28 h-6 md:h-9 text-center font-black text-xs md:text-base text-indigo-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all select-all bubble-input"
                    />
                    <button
                      type="button"
                      onClick={() => setGroupCount((prev) => Math.min(members.filter(m => m.selected !== false).length, prev + 1))}
                      disabled={groupCount >= members.filter(m => m.selected !== false).length}
                      className="w-6 h-6 md:w-9 md:h-9 bg-white hover:bg-slate-100 disabled:opacity-45 rounded-lg flex items-center justify-center font-extrabold text-xs md:text-base text-slate-600 border border-slate-200 transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
                    >
                      +
                    </button>
                  </div>

                  {/* Tiny shuffling button */}
                  <button
                    id="sidebar-action-shuffle"
                    onClick={triggerShuffle}
                    disabled={members.filter(m => m.selected !== false).length === 0 || isShuffling}
                    className="h-7.5 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-bold text-[11px] shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Shuffle className="w-3 h-3" />
                    <span>추첨 실행</span>
                  </button>
                </div>
              </div>

              {/* Main Results Board */}
              <div id="main-results-board" className="flex-1 flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-1 border-b border-slate-100">
                  <div>
                    <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                      실시간 편성 배치도
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
                            명단 텍스트 공유
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
                      <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed">
                        부서원 명단 데이터 준비가 끝나셨다면, 상단 제어 바에서 조 개수를 선택하시고 &lsquo;조 편성 무작위 추첨 실행&rsquo;을 눌러 결과를 바로 확인해보세요!
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
                          disabled={members.filter(m => m.selected !== false).length === 0}
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
          )}
        </AnimatePresence>
      </div>

      {/* 3. SLEEK SYSTEM FOOTER */}
      <footer id="footer-system" className="h-10 bg-slate-800 text-slate-400 px-8 flex items-center justify-between text-[10px] font-semibold shrink-0 z-10 uppercase tracking-wider select-none">
        <div>SYSTEM STATUS: READY TO SHUFFLE & EXPORT</div>
        <div className="flex gap-4 tracking-normal">
          <span>워크숍 분배 매니저 v4.5</span>
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
                  setIsAddMemberModalOpen(false);
                }}
                onSaveMember={(id, updated) => {
                  handleUpdateMember(id, updated);
                  setIsAddMemberModalOpen(false);
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 6. PWA INSTALL GUIDE MODAL */}
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
