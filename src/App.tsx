import React, { useState, useEffect, useRef } from 'react';
import { 
  Shuffle, 
  Plus, 
  Trash2, 
  User, 
  Users, 
  Settings, 
  RefreshCw, 
  Image as ImageIcon, 
  Sparkles, 
  Copy, 
  Check, 
  Upload, 
  X, 
  Edit3, 
  Layers, 
  History, 
  Download, 
  ArrowRight,
  UserPlus,
  HelpCircle,
  AlertCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';

// --- Types ---
interface Member {
  id: string;
  name: string;
  role: string; // e.g. "기획팀", "개발팀" etc (optional category)
  avatarColor: string;
  photoUrl?: string; // Uploaded custom image (base64)
}

interface Team {
  id: string;
  name: string;
  color: string;
  members: Member[];
}

interface ShuffleHistory {
  id: string;
  date: string;
  teams: Team[];
  themeName: string;
}

// Custom Colors for Avatars & Team Borders
const AVATAR_COLORS = [
  'bg-pink-100 text-pink-700 border-pink-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-indigo-100 text-indigo-700 border-indigo-200',
  'bg-cyan-100 text-cyan-700 border-cyan-200',
  'bg-rose-100 text-rose-700 border-rose-200',
];

const TEAM_THEME_COLORS = [
  { bg: 'bg-indigo-50 hover:bg-indigo-100/70', border: 'border-indigo-200', text: 'text-indigo-800', badge: 'bg-indigo-100 text-indigo-700', ring: 'ring-indigo-400' },
  { bg: 'bg-emerald-50 hover:bg-emerald-100/70', border: 'border-emerald-200', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700', ring: 'ring-emerald-400' },
  { bg: 'bg-amber-50 hover:bg-amber-100/70', border: 'border-amber-200', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-700', ring: 'ring-amber-400' },
  { bg: 'bg-rose-50 hover:bg-rose-100/70', border: 'border-rose-200', text: 'text-rose-800', badge: 'bg-rose-100 text-rose-700', ring: 'ring-rose-400' },
  { bg: 'bg-purple-50 hover:bg-purple-100/70', border: 'border-purple-200', text: 'text-purple-800', badge: 'bg-purple-100 text-purple-700', ring: 'ring-purple-400' },
  { bg: 'bg-sky-50 hover:bg-sky-100/70', border: 'border-sky-200', text: 'text-sky-800', badge: 'bg-sky-100 text-sky-700', ring: 'ring-sky-400' },
  { bg: 'bg-pink-50 hover:bg-pink-100/70', border: 'border-pink-200', text: 'text-pink-800', badge: 'bg-pink-100 text-pink-700', ring: 'ring-pink-400' },
  { bg: 'bg-teal-50 hover:bg-teal-100/70', border: 'border-teal-200', text: 'text-teal-800', badge: 'bg-teal-100 text-teal-700', ring: 'ring-teal-400' },
];

const GROUP_THEMES = [
  { id: 'standard', name: '일반 (1조, 2조...)', prefixes: ['1조', '2조', '3조', '4조', '5조', '6조', '7조', '8조', '9조', '10조'] },
  { id: 'animals', name: '동물 (사자, 호랑이...)', prefixes: ['🦁 사자 조', '🐯 호랑이 조', '🦅 독수리 조', '🐻 곰 조', '🦊 여우 조', '🐬 돌고래 조', '🐼 판다 조', '🦉 부엉이 조'] },
  { id: 'planets', name: '우주 (수성, 금성...)', prefixes: ['☀️ 태양 팀', '🚀 은하 팀', '🌎 지구 팀', '🪐 토성 팀', '☄️ 혜성 팀', '💫 성운 팀', '🌌 은하수 팀', '🛸 안드로메다 팀'] },
  { id: 'colors', name: '컬러 (레드, 블루...)', prefixes: ['🔴 레드 팀', '🔵 블루 팀', '🟢 그린 팀', '🟡 옐로우 팀', '🟣 퍼플 팀', '🟠 오렌지 팀', '🟤 브라운 팀', '⚫ 블랙 팀'] },
  { id: 'gems', name: '보석 (루비, 사파이어...)', prefixes: ['💎 다이아몬드', '❤️ 루비', '💙 사파이어', '💚 에메랄드', '💛 토파즈', '💜 아메시스트', '🖤 오팔', '🤍 진주'] },
];

const DEFAULT_MEMBERS: Member[] = [
  { id: '1', name: '김철수', role: '기획팀', avatarColor: AVATAR_COLORS[0] },
  { id: '2', name: '이영희', role: '개발팀', avatarColor: AVATAR_COLORS[1] },
  { id: '3', name: '박민수', role: '디자인팀', avatarColor: AVATAR_COLORS[2] },
  { id: '4', name: '정수진', role: '마케팅팀', avatarColor: AVATAR_COLORS[3] },
  { id: '5', name: '최동현', role: '개발팀', avatarColor: AVATAR_COLORS[4] },
  { id: '6', name: '한지원', role: '기획팀', avatarColor: AVATAR_COLORS[5] },
  { id: '7', name: '윤지환', role: '디자인팀', avatarColor: AVATAR_COLORS[6] },
  { id: '8', name: '강다솜', role: '마케팅팀', avatarColor: AVATAR_COLORS[7] },
  { id: '9', name: '조현우', role: '기획팀', avatarColor: AVATAR_COLORS[0] },
  { id: '10', name: '임채원', role: '개발팀', avatarColor: AVATAR_COLORS[1] },
  { id: '11', name: '백승우', role: '개발팀', avatarColor: AVATAR_COLORS[2] },
  { id: '12', name: '서미경', role: '디자인팀', avatarColor: AVATAR_COLORS[3] },
];

export default function App() {
  // --- States ---
  const [members, setMembers] = useState<Member[]>(() => {
    const saved = localStorage.getItem('ts_members');
    return saved ? JSON.parse(saved) : DEFAULT_MEMBERS;
  });

  const [teams, setTeams] = useState<Team[]>([]);
  const [history, setHistory] = useState<ShuffleHistory[]>(() => {
    const saved = localStorage.getItem('ts_history');
    return saved ? JSON.parse(saved) : [];
  });

  // Controls & Settings
  const [targetType, setTargetType] = useState<'count' | 'size'>('count'); // Split by total number of teams, or max size per team
  const [targetValue, setTargetValue] = useState<number>(3); // Default 3 teams / 3 members
  const [selectedTheme, setSelectedTheme] = useState<string>('standard');
  const [avoidSameRole, setAvoidSameRole] = useState<boolean>(true); // Balance same-department members across teams
  
  // Animation state
  const [isShuffling, setIsShuffling] = useState<boolean>(false);
  const [shuffledIndicatorList, setShuffledIndicatorList] = useState<Member[]>([]);
  const [activeFlippedCard, setActiveFlippedCard] = useState<number>(-1);
  const [animationStep, setAnimationStep] = useState<'idle' | 'mixing' | 'building' | 'done'>('idle');

  // New Member Modal/Inputs
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('');
  const [newMemberPhoto, setNewMemberPhoto] = useState<string | undefined>(undefined);
  const [avatarIndex, setAvatarIndex] = useState(0);

  // CSV/Bulk Import
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  // Editing utility
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  // Clipboard copies
  const [copiedResult, setCopiedResult] = useState(false);

  // File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Save to localStorage on member changes
  useEffect(() => {
    localStorage.setItem('ts_members', JSON.stringify(members));
  }, [members]);

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem('ts_history', JSON.stringify(history));
  }, [history]);

  // Handle avatar photo selection
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (isEdit && editingMember) {
          setEditingMember({ ...editingMember, photoUrl: reader.result as string });
        } else {
          setNewMemberPhoto(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Trigger file manager click
  const triggerFileSelect = (isEdit = false) => {
    if (isEdit) {
      editFileInputRef.current?.click();
    } else {
      fileInputRef.current?.click();
    }
  };

  // Add individual member
  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;

    const newMember: Member = {
      id: Date.now().toString(),
      name: newMemberName.trim(),
      role: newMemberRole.trim() || '일반원',
      avatarColor: AVATAR_COLORS[avatarIndex % AVATAR_COLORS.length],
      photoUrl: newMemberPhoto,
    };

    setMembers([...members, newMember]);
    setNewMemberName('');
    setNewMemberRole('');
    setNewMemberPhoto(undefined);
    setAvatarIndex(prev => prev + 1);
  };

  // Edit / Update Member
  const handleSaveEdit = () => {
    if (!editingMember || !editingMember.name.trim()) return;
    setMembers(members.map(m => m.id === editingMember.id ? editingMember : m));
    setEditingMember(null);
  };

  // Delete individual member
  const handleDeleteMember = (id: string) => {
    setMembers(members.filter(m => m.id !== id));
  };

  // Clear all members
  const handleClearAllMembers = () => {
    if (window.confirm('정말 모든 부서원 목록을 삭제하시겠습니까?')) {
      setMembers([]);
    }
  };

  // Restore default preloaded members
  const handleRestoreDefaults = () => {
    if (window.confirm('기본 예시 부서원 목록(12명)으로 복구하시겠습니까? 현재 목록은 덮어쓰기 됩니다.')) {
      setMembers(DEFAULT_MEMBERS);
    }
  };

  // Bulk Import logic
  const handleBulkImport = () => {
    if (!bulkText.trim()) return;
    // Lines can have formats: "Name", "Name Department", "Name, Department"
    const lines = bulkText.split('\n');
    const imported: Member[] = [];
    let colorCursor = avatarIndex;

    lines.forEach(line => {
      const cleaned = line.trim();
      if (!cleaned) return;

      let name = cleaned;
      let role = '일반원';

      // Split by comma or tab or spaces
      const parts = cleaned.indexOf(',') !== -1 
        ? cleaned.split(',') 
        : cleaned.split(/\s+/);

      if (parts.length > 1) {
        name = parts[0].trim();
        role = parts.slice(1).join(' ').trim();
      }

      if (name) {
        imported.push({
          id: `${Date.now()}-${Math.random()}`,
          name: name,
          role: role || '일반원',
          avatarColor: AVATAR_COLORS[colorCursor % AVATAR_COLORS.length]
        });
        colorCursor++;
      }
    });

    setMembers([...members, ...imported]);
    setAvatarIndex(colorCursor);
    setBulkText('');
    setIsBulkImportOpen(false);
  };

  // --- Core Shuffle Algorithm ---
  const performShuffle = () => {
    if (members.length === 0) return;

    setIsShuffling(true);
    setAnimationStep('mixing');
    setTeams([]);

    // We do a theatrical multi-phase animation
    // Mix items, flash active items, then render layout
    let shuffleCounter = 0;
    const interval = setInterval(() => {
      // Pick dynamic highlighted items to simulate "rapid machine shuffling" name generator
      const randomIndex = Math.floor(Math.random() * members.length);
      setActiveFlippedCard(randomIndex);
      shuffleCounter++;
      
      if (shuffleCounter > 18) {
        clearInterval(interval);
        
        // Post mix: Proceed to compute teams build
        setActiveFlippedCard(-1);
        setAnimationStep('building');
        
        setTimeout(() => {
          executeTeamSplitting();
        }, 600);
      }
    }, 120);
  };

  const executeTeamSplitting = () => {
    // 1. Shallow copy of members
    const shuffledList = [...members];
    
    // Simple Fisher-Yates shuffle
    for (let i = shuffledList.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledList[i], shuffledList[j]] = [shuffledList[j], shuffledList[i]];
    }

    // 2. Determine perfect number of teams
    let numTeams = 3;
    if (targetType === 'count') {
      numTeams = Math.max(1, Math.min(targetValue, members.length));
    } else {
      // size per team
      numTeams = Math.max(1, Math.ceil(members.length / targetValue));
    }

    // Setup empty teams base
    const themeObj = GROUP_THEMES.find(t => t.id === selectedTheme) || GROUP_THEMES[0];
    const generatedTeams: Team[] = Array.from({ length: numTeams }, (_, i) => {
      const teamName = themeObj.prefixes[i % themeObj.prefixes.length] || `팀 ${i + 1}`;
      return {
        id: `team-${i}`,
        name: teamName,
        color: TEAM_THEME_COLORS[i % TEAM_THEME_COLORS.length].badge,
        members: []
      };
    });

    // 3. Balance distribution with role grouping if toggle is enabled
    if (avoidSameRole) {
      // Group by roles
      const roleGroups: { [key: string]: Member[] } = {};
      shuffledList.forEach(m => {
        const r = m.role.toLowerCase().trim();
        if (!roleGroups[r]) roleGroups[r] = [];
        roleGroups[r].push(m);
      });

      // Distribute each role group to minimize same-role clustering in one group
      let currentTeamIdx = 0;
      Object.keys(roleGroups).forEach(role => {
        const groupMembers = roleGroups[role];
        groupMembers.forEach(m => {
          generatedTeams[currentTeamIdx].members.push(m);
          currentTeamIdx = (currentTeamIdx + 1) % numTeams;
        });
      });
    } else {
      // Standard simple round-robin distribution
      shuffledList.forEach((m, idx) => {
        const teamIdx = idx % numTeams;
        generatedTeams[teamIdx].members.push(m);
      });
    }

    // Sort teams to look nice or random balance
    setTeams(generatedTeams);
    setIsShuffling(false);
    setAnimationStep('done');

    // Trigger wonderful confetti celebration
    triggerConfettiCelebrate();

    // Save this gorgeous result into histories
    const newHistory: ShuffleHistory = {
      id: Date.now().toString(),
      date: new Date().toLocaleDateString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      teams: generatedTeams,
      themeName: themeObj.name,
    };
    setHistory(prev => [newHistory, ...prev].slice(0, 15)); // Keep last 15 shuffles
  };

  // Standard colorful confetti burst
  const triggerConfettiCelebrate = () => {
    const duration = 2.5 * 1000;
    const end = Date.now() + duration;

    (function frame() {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#3b82f6']
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#3b82f6']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  };

  // Reset/Clear teams
  const handleResetTeams = () => {
    setTeams([]);
    setAnimationStep('idle');
  };

  // Copy Results to Clipboard
  const handleCopyResults = () => {
    if (teams.length === 0) return;
    
    let text = `🎉 【 TeamShuffle ] 흩어져있던 우리가 하나되는 시간 🎉\n`;
    text += `조 편성 테마: ${GROUP_THEMES.find(t => t.id === selectedTheme)?.name || '일반'}\n\n`;

    teams.forEach(team => {
      text += `📍 ${team.name} (${team.members.length}명)\n`;
      text += `━━━━━━━━━━━━━━\n`;
      text += team.members.map(m => ` - ${m.name} (${m.role})`).join('\n') || ' (지정된 부서원 없음)';
      text += `\n\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
      setCopiedResult(true);
      setTimeout(() => setCopiedResult(false), 2000);
    });
  };

  // Remove history item
  const handleDeleteHistory = (histId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(history.filter(h => h.id !== histId));
  };

  // Load old shuffle
  const handleLoadHistory = (hist: ShuffleHistory) => {
    setTeams(hist.teams);
    setAnimationStep('done');
  };

  // Manual Member swaps Drag/Drop or Move between teams
  const moveMemberToTeam = (memberId: string, targetTeamId: string) => {
    // Find member
    let memberToMove: Member | null = null;
    const updatedTeams = teams.map(team => {
      const exists = team.members.find(m => m.id === memberId);
      if (exists) {
        memberToMove = exists;
        return {
          ...team,
          members: team.members.filter(m => m.id !== memberId)
        };
      }
      return team;
    });

    if (memberToMove) {
      const finalTeams = updatedTeams.map(team => {
        if (team.id === targetTeamId) {
          return {
            ...team,
            members: [...team.members, memberToMove!]
          };
        }
        return team;
      });
      setTeams(finalTeams);
    }
  };

  // Helper render for avatars
  const renderAvatar = (member: Member, sizeClass = "w-10 h-10 text-sm") => {
    if (member.photoUrl) {
      return (
        <img 
          src={member.photoUrl} 
          alt={member.name} 
          className={`${sizeClass} rounded-full object-cover border-2 border-white ring-2 ring-indigo-50`} 
        />
      );
    }
    return (
      <div className={`${sizeClass} rounded-full flex items-center justify-center font-bold border ${member.avatarColor}`}>
        {member.name.slice(-2)}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50/70 py-8 px-4 sm:px-6 lg:px-8 font-sans transition-colors duration-300">
      {/* Dynamic Header */}
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200/80 pb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-150 animate-bounce-soft">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 id="app-title" className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-800 bg-clip-text text-transparent tracking-tight">
                TeamShuffle
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                대자연의 우주적 에너지를 담아 활기차고 풍성한 조를 정교하게 빌드합니다.
              </p>
            </div>
          </div>

          <div className="mt-4 md:mt-0 flex flex-wrap gap-2">
            <button
              id="restore-defaults-btn"
              onClick={handleRestoreDefaults}
              className="px-3.5 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50 bg-white font-semibold rounded-lg border border-indigo-200 transition-all flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              예시 리셋
            </button>
            <button
              id="bulk-import-toggle"
              onClick={() => setIsBulkImportOpen(true)}
              className="px-3.5 py-1.5 text-xs text-slate-700 bg-white hover:bg-slate-50 font-semibold rounded-lg border border-slate-300 transition-all flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <Users className="w-3.5 h-3.5 text-slate-500" />
              일괄 직접 입력
            </button>
          </div>
        </header>

        {/* Dashboard Grid (Two Column) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT PANEL: Member Pool Control Area (Col 5) */}
          <section className="lg:col-span-4 space-y-6">
            
            {/* 1. Add Member Card */}
            <div id="add-member-card" className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-indigo-500" />
                부서원 직접 등록
              </h2>
              
              <form onSubmit={handleAddMember} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">이름 *</label>
                  <input
                    type="text"
                    required
                    placeholder="홍길동"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-300 text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">소속 / 부서 / 역할 (선택)</label>
                  <input
                    type="text"
                    placeholder="예: 기획팀, 디자이너"
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-300 text-slate-800"
                  />
                </div>

                {/* Avatar/Photo Upload Section */}
                <div className="space-y-1.5">
                  <span className="block text-xs font-semibold text-slate-500">프로필 사진 (선택)</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      id="upload-photo-btn"
                      onClick={() => triggerFileSelect(false)}
                      className="h-14 w-14 rounded-2xl bg-slate-50 hover:bg-slate-100/70 border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 group transition-all"
                    >
                      {newMemberPhoto ? (
                        <img 
                          src={newMemberPhoto} 
                          alt="preview" 
                          className="w-full h-full object-cover rounded-2xl" 
                        />
                      ) : (
                        <>
                          <Upload className="w-4 h-4 group-hover:text-indigo-500 transition-colors" />
                          <span className="text-[9px] mt-0.5 font-bold">등록</span>
                        </>
                      )}
                    </button>
                    
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={(e) => handlePhotoUpload(e, false)}
                      className="hidden"
                    />

                    <div className="text-xs text-slate-500">
                      {newMemberPhoto ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-emerald-600 font-bold">✓ 사진 준비 완료</span>
                          <button 
                            type="button"
                            onClick={() => setNewMemberPhoto(undefined)}
                            className="text-slate-400 hover:text-red-500"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        "사진 미지정 시 이니셜이 포함된 멋진 랜덤 파스텔 프로필이 자동 지정됩니다."
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  id="add-member-btn"
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-indigo-100 flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  부서원 등록하기
                </button>
              </form>
            </div>

            {/* Editing modal helper inline */}
            {editingMember && (
              <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-5 space-y-4 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
                    <Edit3 className="w-4 h-4" />
                    부서원 정보 편집
                  </h3>
                  <button onClick={() => setEditingMember(null)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500">이름</label>
                    <input
                      type="text"
                      className="w-full px-3 py-1.5 text-sm bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800"
                      value={editingMember.name}
                      onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500">부서 / 역할</label>
                    <input
                      type="text"
                      className="w-full px-3 py-1.5 text-sm bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-800"
                      value={editingMember.role}
                      onChange={(e) => setEditingMember({ ...editingMember, role: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => triggerFileSelect(true)}
                      className="h-10 w-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-50"
                    >
                      {editingMember.photoUrl ? (
                        <img src={editingMember.photoUrl} alt="edit" className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        <ImageIcon className="w-4 h-4" />
                      )}
                    </button>
                    <input
                      type="file"
                      ref={editFileInputRef}
                      accept="image/*"
                      onChange={(e) => handlePhotoUpload(e, true)}
                      className="hidden"
                    />
                    <span className="text-xs text-slate-500">프로필 사진을 업데이트할 수 있습니다.</span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveEdit}
                      className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition-colors"
                    >
                      변경 내용 저장
                    </button>
                    <button
                      onClick={() => setEditingMember(null)}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs rounded-lg transition-colors"
                    >
                      취소
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Parameters Configuration */}
            <div id="settings-card" className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Settings className="w-4 h-4 text-emerald-500" />
                조 편성 분할 설정
              </h2>

              <div className="space-y-4">
                {/* Target Split Type */}
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1.5 rounded-xl">
                  <button
                    type="button"
                    onClick={() => { setTargetType('count'); setTargetValue(3); }}
                    className={`py-2 text-xs font-bold rounded-lg transition-all ${targetType === 'count' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    총 생성할 조의 개수
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTargetType('size'); setTargetValue(4); }}
                    className={`py-2 text-xs font-bold rounded-lg transition-all ${targetType === 'size' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    조당 가득 찰 멤버수
                  </button>
                </div>

                {/* Target Number Config */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-semibold text-slate-500">
                      {targetType === 'count' ? '원하는 총 조의 개수(팀)' : '조 한 팀당 최대 정원(명)'}
                    </label>
                    <span className="text-sm font-black text-indigo-600">{targetValue} {targetType === 'count' ? '개 조' : '명'}</span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max={targetType === 'count' ? Math.max(2, members.length) : Math.max(2, members.length)}
                    value={targetValue}
                    onChange={(e) => setTargetValue(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    {targetType === 'count' 
                      ? `총 ${members.length}명의 부서원을 ${targetValue}개 조로 분할 구성합니다.`
                      : `한 팀의 최대 정원을 ${targetValue}명으로 제한하여 균등 편향 분리합니다.`
                    }
                  </p>
                </div>

                {/* Group Names Theme Collection */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">조 이름 테마</label>
                  <select
                    value={selectedTheme}
                    onChange={(e) => setSelectedTheme(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-slate-700"
                  >
                    {GROUP_THEMES.map(theme => (
                      <option key={theme.id} value={theme.id}>{theme.name}</option>
                    ))}
                  </select>
                </div>

                {/* Same Team Balance Toggle */}
                <div className="flex items-start gap-2.5 pt-1">
                  <input
                    type="checkbox"
                    id="avoidSameRoleCheckbox"
                    checked={avoidSameRole}
                    onChange={(e) => setAvoidSameRole(e.target.checked)}
                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-400 h-4.5 w-4.5 border-slate-300"
                  />
                  <div className="text-xs">
                    <label htmlFor="avoidSameRoleCheckbox" className="font-bold text-slate-700 cursor-pointer">
                      부서/역할 쏠림 최소화 균형 배분
                    </label>
                    <p className="text-slate-400 mt-0.5 font-medium leading-relaxed">
                      동일한 소속이나 부서의 사람들이 같은 조에 몰리지 않도록 최대한 다른 조로 골고루 균형 편향 분배합니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. History Panel */}
            {history.length > 0 && (
              <div id="history-panel" className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <History className="w-4 h-4 text-violet-500" />
                  최근 조 편성 이력 (최대 15개)
                </h2>
                
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {history.map((hist) => (
                    <div
                      key={hist.id}
                      onClick={() => handleLoadHistory(hist)}
                      className="p-2.5 rounded-xl border border-slate-100 hover:border-indigo-100 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition-all flex items-center justify-between group"
                    >
                      <div className="truncate pr-2">
                        <div className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                          <span>{hist.teams.length}개 조 편성 완료</span>
                          <span className="text-[10px] font-medium text-slate-400 bg-slate-200/50 px-1.5 py-0.5 rounded">
                            {hist.themeName.split(' ')[0]}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{hist.date}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-indigo-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">불러오기</span>
                        <button
                          onClick={(e) => handleDeleteHistory(hist.id, e)}
                          className="p-1 text-slate-300 hover:text-red-500 rounded hover:bg-slate-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* RIGHT PANEL: Member Pool State AND Results Shuffling Arena (Col 7) */}
          <main className="lg:col-span-8 flex flex-col gap-8">
            
            {/* 1. All Current Members Board */}
            <div id="members-list-container" className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                    <Users className="w-4 h-4" />
                  </span>
                  <h2 className="text-base font-black text-slate-800">
                    현재 대기 부서원 목록
                  </h2>
                  <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">
                    {members.length}명
                  </span>
                </div>
                
                {members.length > 0 && (
                  <button
                    id="clear-all-btn"
                    onClick={handleClearAllMembers}
                    className="text-xs text-red-500 hover:text-red-600 hover:underline flex items-center gap-1 self-end sm:self-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    전체 삭제
                  </button>
                )}
              </div>

              {members.length === 0 ? (
                <div className="border-2 border-dashed border-slate-100 rounded-2xl p-10 text-center space-y-3">
                  <div className="bg-slate-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto text-slate-400">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-700">등록된 부서원이 없습니다</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                      좌측의 개별 부서원 등록 폼 또는 상단의 대용량 [일괄 직접 입력] 버튼이나 우측의 [예시 리셋] 버튼을 통해 예시 부서원들을 빠르게 로드해보세요!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-80 overflow-y-auto pr-1">
                  {members.map((member, index) => {
                    const isFlipped = activeFlippedCard === index;
                    return (
                      <div
                        key={member.id}
                        onClick={() => setEditingMember(member)}
                        className={`group relative p-3 rounded-xl border transition-all duration-200 cursor-pointer text-left flex items-center gap-2.5 ${
                          isFlipped 
                            ? 'bg-blue-600 text-white border-blue-600 pulse-glow scale-105' 
                            : 'bg-white text-slate-800 border-slate-200/70 hover:border-indigo-200 hover:shadow-sm'
                        }`}
                      >
                        {renderAvatar(member, "w-10 h-10 text-sm flex-shrink-0")}
                        <div className="min-w-0 pr-4">
                          <p className={`text-xs font-black truncate ${isFlipped ? 'text-white' : 'text-slate-700'}`}>
                            {member.name}
                          </p>
                          <p className={`text-[10px] truncate ${isFlipped ? 'text-white/80' : 'text-slate-400 font-bold'}`}>
                            {member.role}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMember(member.id);
                          }}
                          className={`absolute right-1.5 p-1 rounded hover:bg-red-50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ${
                            isFlipped ? 'text-white hover:bg-blue-700 hover:text-white' : 'text-slate-300'
                          }`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ACTION TRIGGER: HUGE SHUFFLE TRIGGER CARD */}
              <div className="pt-2">
                <button
                  type="button"
                  id="trigger-shuffle-btn"
                  disabled={members.length === 0 || isShuffling}
                  onClick={performShuffle}
                  className={`w-full py-4 text-base font-black tracking-wide rounded-2xl flex items-center justify-center gap-2.5 shadow-lg transition-all duration-300 ${
                    members.length === 0 || isShuffling
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                      : 'bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 hover:-translate-y-0.5 active:translate-y-0 shadow-indigo-150'
                  }`}
                >
                  <Shuffle className={`w-5 h-5 ${isShuffling ? 'animate-spin' : ''}`} />
                  {isShuffling ? '대자연의 에너지를 섞는 중...' : '마법 같은 랜덤 조 편성 시작하기'}
                </button>
              </div>
            </div>

            {/* 2. Primary Showcase Stage (Active Shuffle or Results) */}
            <div id="results-and-shuffling-stage" className="space-y-6">
              
              {/* SHUFFLE ACTIVE ANIMATION CONTAINER */}
              {isShuffling && (
                <div className="bg-gradient-to-tr from-slate-900 via-indigo-950 to-indigo-900 rounded-3xl p-8 text-center text-white relative overflow-hidden shadow-2xl pulse-glow">
                  {/* Decorative background lights */}
                  <div className="absolute top-1/4 left-1/4 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl animate-pulse"></div>
                  <div className="absolute bottom-1/4 right-1/4 w-40 h-40 bg-pink-500/10 rounded-full blur-3xl animate-pulse"></div>

                  <div className="relative z-10 space-y-8 py-6">
                    <div className="inline-flex py-1.5 px-4 bg-white/10 backdrop-blur-md rounded-full border border-white/10 text-xs font-semibold text-indigo-300 items-center gap-1.5 animate-bounce-soft">
                      <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                      부서 조원 대이동 및 가상 배정 시뮬레이션
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white animate-pulse">
                        엄격하고 공정한 셔플 카드가 정렬을 조합하는 중입니다...
                      </h3>
                      <p className="text-sm text-indigo-200 max-w-md mx-auto font-medium">
                        성향 쏠림, 부서 분포 및 고유 난수를 수용하여 우주적 에너지로 최적의 조합을 연산하고 있습니다.
                      </p>
                    </div>

                    {/* Highly active swirling particles mimicking a shuffle */}
                    <div className="flex justify-center items-center gap-3">
                      <div className="w-4 h-4 rounded-full bg-indigo-500 animate-ping"></div>
                      <div className="w-50 h-10 border border-indigo-700 rounded-full flex items-center justify-around px-4 bg-indigo-900/40 backdrop-blur relative overflow-hidden">
                        <div className="absolute top-0 bottom-0 left-0 bg-indigo-600 animate-[pulse_1s_infinite] w-2/3 opacity-30"></div>
                        <span className="text-[10px] text-indigo-300 font-mono tracking-widest">{`SHUFFLING_${Date.now().toString().slice(-4)}`}</span>
                      </div>
                      <div className="w-4 h-4 rounded-full bg-pink-500 animate-ping"></div>
                    </div>
                  </div>
                </div>
              )}

              {/* RENDER FINISHED SHUFFLED REALIGNMENT GROUPS */}
              {animationStep === 'done' && teams.length > 0 && (
                <div id="final-teams-card" className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6 animate-fade-in">
                  
                  {/* Header controller for Results */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 gap-4">
                    <div className="flex items-center gap-2">
                      <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                        <Layers className="w-5 h-5" />
                      </span>
                      <div>
                        <h3 className="text-lg font-black text-slate-800">
                          🎉 조 편성 최종 완료 !
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          부서원들의 자리가 재배치되었습니다. 자유롭게 수동으로 드래그 앤 드롭 하거나 수동 배치 조정이 가능합니다.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <button
                        type="button"
                        id="reset-teams-btn"
                        onClick={handleResetTeams}
                        className="p-2 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100/70 border border-slate-200 rounded-xl transition-all"
                      >
                        결과 닫기
                      </button>
                      
                      <button
                        type="button"
                        id="copy-results-btn"
                        onClick={handleCopyResults}
                        className={`px-4 py-2 text-xs font-black rounded-xl transition-all flex items-center gap-1.5 shadow-sm ${
                          copiedResult 
                            ? 'bg-emerald-600 text-white' 
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        }`}
                      >
                        {copiedResult ? (
                          <>
                            <Check className="w-4 h-4" />
                            복사 완료!
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            텍스트 결과 복사
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* TEAMS LAYOUT GRID */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-5">
                    {teams.map((team) => {
                      const themeMatch = TEAM_THEME_COLORS[Math.abs(team.id.charCodeAt(5) || 0) % TEAM_THEME_COLORS.length] || TEAM_THEME_COLORS[0];
                      return (
                        <div
                          key={team.id}
                          className={`rounded-2xl border-2 p-4 flex flex-col justify-between transition-all shadow-sm ${themeMatch.bg} ${themeMatch.border}`}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const memberId = e.dataTransfer.getData('text/plain');
                            if (memberId) {
                              moveMemberToTeam(memberId, team.id);
                            }
                          }}
                        >
                          <div>
                            {/* Team Header Title */}
                            <div className="flex items-center justify-between pb-3 mb-3 border-b border-dashed border-slate-300/60">
                              <span className={`text-sm font-black px-3 py-1 rounded-xl shadow-sm ${themeMatch.badge}`}>
                                {team.name}
                              </span>
                              <span className="text-[11px] font-black text-slate-500">
                                {team.members.length}명 대형
                              </span>
                            </div>

                            {/* Team Members List */}
                            {team.members.length === 0 ? (
                              <div className="py-6 text-center text-xs text-slate-400 italic">
                                빈 팀입니다. 이곳으로 부서원을 떨어뜨리세요!
                              </div>
                            ) : (
                              <div className="space-y-2 min-h-[100px]">
                                {team.members.map((member) => (
                                  <div
                                    key={member.id}
                                    draggable
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData('text/plain', member.id);
                                    }}
                                    className="bg-white p-2.5 rounded-xl border border-slate-200/80 hover:border-slate-300 shadow-sm cursor-grab active:cursor-grabbing hover:scale-[1.01] transition-all flex items-center justify-between group"
                                  >
                                    <div className="flex items-center gap-2">
                                      {renderAvatar(member, "w-8 h-8 text-xs")}
                                      <div>
                                        <p className="text-xs font-black text-slate-800">{member.name}</p>
                                        <p className="text-[9px] text-slate-400 font-bold">{member.role}</p>
                                      </div>
                                    </div>

                                    {/* Action button to quickly shift member to another group */}
                                    <div className="flex items-center gap-1">
                                      <select
                                        className="text-[9px] font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                        value={team.id}
                                        onChange={(e) => moveMemberToTeam(member.id, e.target.value)}
                                      >
                                        <option value={team.id} disabled>조 이동</option>
                                        {teams.filter(t => t.id !== team.id).map(t => (
                                          <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="pt-3 mt-3 border-t border-dashed border-slate-300/40 text-[9px] text-slate-400 text-right">
                            * 소원을 담은 완벽한 조합
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            
            {/* Elegant Tips info banner */}
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 flex gap-3 text-slate-700">
              <Sparkles className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <span className="font-bold text-indigo-900">사용 꿀팁 가이드</span>
                <p className="text-slate-600 leading-relaxed font-medium">
                  조편성 완료 후, 결과를 수정하고 싶으시다면 원하는 부서원 카드 혹은 우측 상단의 조 이동 조절을 이용해 다른 조로 직접 수동 드래그 앤 드롭 이동 혹은 지정 이동할 수 있습니다.
                </p>
              </div>
            </div>

          </main>
        </div>
      </div>

      {/* BULK IMPORT MODAL DIALOG */}
      {isBulkImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-500" />
                <h3 className="text-base font-black text-slate-800">
                  대용량 부서원 직접 일괄 등록
                </h3>
              </div>
              <button
                onClick={() => setIsBulkImportOpen(false)}
                className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                줄바꿈 한줄에 한 명씩 이름을 입력해주세요. 부서/역할을 함께 입력하려면 쉼표(,)나 공백(스페이스) 하나로 이름을 구분해주시면 됩니다.
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] font-mono text-slate-500">
                <p className="font-bold mb-1 text-slate-700">📌 예시 입력 형태:</p>
                <p>김민수 디자인팀</p>
                <p>이지원, 마케팅팀</p>
                <p>박정호 개발팀</p>
                <p>송은우</p>
              </div>
            </div>

            <div>
              <textarea
                rows={7}
                placeholder="여기에 부서원 목록 복사 붙여넣기..."
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                className="w-full p-3 font-mono text-xs bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsBulkImportOpen(false)}
                className="px-4 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleBulkImport}
                disabled={!bulkText.trim()}
                className={`px-4 py-2 text-xs font-bold rounded-xl text-white ${
                  bulkText.trim() ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-200 hover:bg-slate-200 cursor-not-allowed'
                }`}
              >
                분석 및 일괄 추가
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
