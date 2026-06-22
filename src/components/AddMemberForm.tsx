/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, Plus, User, Sparkles, Crop, Move, Check, Award, Users, FileText } from 'lucide-react';
import { Member } from '../types';

interface AddMemberFormProps {
  onAddMember?: (member: Omit<Member, 'id'>) => void;
  onAddMembers?: (members: Omit<Member, 'id'>[]) => void;
  onSaveMember?: (id: string, updated: Omit<Member, 'id' | 'selected'>) => void;
  initialMember?: Member | null;
}

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=faces&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=faces&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=faces&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=faces&q=80',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=faces&q=80',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=faces&q=80',
];

export default function AddMemberForm({ onAddMember, onAddMembers, onSaveMember, initialMember }: AddMemberFormProps) {
  const [inputTab, setInputTab] = useState<'detail' | 'simple'>('detail');
  const [name, setName] = useState(initialMember ? initialMember.name : '');
  const [photoUrl, setPhotoUrl] = useState(initialMember ? initialMember.photoUrl : '');
  const [role, setRole] = useState(initialMember ? (initialMember.role || '부서원') : '부서원');
  const [bulkNames, setBulkNames] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialMember) {
      setName(initialMember.name);
      setPhotoUrl(initialMember.photoUrl);
      setRole(initialMember.role || '부서원');
      setInputTab('detail'); // Force detail mode when editing
    } else {
      setName('');
      setPhotoUrl('');
      setRole('부서원');
    }
  }, [initialMember]);

  // Cropping states
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.2);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageAspect, setImageAspect] = useState(1);
  const imageRef = useRef<HTMLImageElement>(null);

  const handleImageUpload = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setRawImage(e.target.result as string);
          setZoom(1.2);
          setOffsetX(0);
          setOffsetY(0);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const onDragLeave = () => {
    setIsDragActive(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageUpload(e.dataTransfer.files[0]);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleImageUpload(e.target.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (inputTab === 'simple' && !initialMember) {
      const cleanedText = bulkNames.trim();
      if (!cleanedText) return;

      // Parse names split by commas, newlines, semicolons or dots
      const parsedNames = cleanedText
        .split(/[\n,;.\t]+/)
        .map((n) => n.trim())
        .filter((n) => n.length > 0);

      if (parsedNames.length === 0) {
        alert('올바른 형식의 이름을 입력해주세요.');
        return;
      }

      const newBatch = parsedNames.map((n, idx) => {
        const finalPhoto = AVATAR_PRESETS[idx % AVATAR_PRESETS.length];
        return {
          name: n,
          role: role.trim() || '부서원',
          photoUrl: finalPhoto,
        };
      });

      if (onAddMembers) {
        onAddMembers(newBatch);
      } else if (onAddMember) {
        newBatch.forEach((m) => onAddMember(m));
      }

      setBulkNames('');
      setRole('부서원');
      return;
    }

    if (!name.trim()) return;

    // Use a default avatar if none chosen
    const finalPhoto = photoUrl || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=faces&q=80';

    if (initialMember && onSaveMember) {
      onSaveMember(initialMember.id, {
        name: name.trim(),
        role: role.trim(),
        photoUrl: finalPhoto,
      });
    } else if (onAddMember) {
      onAddMember({
        name: name.trim(),
        role: role.trim(),
        photoUrl: finalPhoto,
      });
    }

    // Reset fields
    setName('');
    setPhotoUrl('');
    setRole('부서원');
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // Drag interaction handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - offsetX, y: e.clientY - offsetY });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    e.preventDefault();
    setOffsetX(e.clientX - dragStart.x);
    setOffsetY(e.clientY - dragStart.y);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageAspect(img.naturalWidth / img.naturalHeight);
  };

  // Crop image utilizing scale & offsets calculations mapped to HTML5 helper Canvas
  const cropImage = () => {
    const img = imageRef.current;
    if (!img) return;

    const canvas = document.createElement('canvas');
    canvas.width = 150;
    canvas.height = 150;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawW = imageAspect > 1 ? 160 * imageAspect : 160;
    const drawH = imageAspect > 1 ? 160 : 160 / imageAspect;

    ctx.scale(150 / 160, 150 / 160);
    ctx.translate(80, 80);
    ctx.translate(offsetX, offsetY);
    ctx.scale(zoom, zoom);
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

    try {
      const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setPhotoUrl(croppedDataUrl);
    } catch (err) {
      console.error('Failed to crop image:', err);
    }

    setRawImage(null);
    setOffsetX(0);
    setOffsetY(0);
    setZoom(1.2);
  };

  // Render crop dialog state if image is selected
  if (rawImage) {
    const drawW = imageAspect > 1 ? 160 * imageAspect : 160;
    const drawH = imageAspect > 1 ? 160 : 160 / imageAspect;

    return (
      <div className="space-y-4 select-none">
        <div className="flex items-center gap-1.5 pb-2 border-b border-slate-100">
          <Crop className="w-4 h-4 text-indigo-500 animate-pulse" />
          <span className="font-bold text-xs text-slate-700">부서원 사진 영역 편집</span>
        </div>
        
        <p className="text-[10px] text-slate-400 leading-relaxed font-semibold">
          마우스로 이미지를 드래그하여 원 안에서 얼굴의 위치를 맞추고, 아래 슬라이더로 조절하세요.
        </p>

        {/* Cropping Mask Container */}
        <div className="flex flex-col items-center justify-center py-2">
          <div 
            className="w-40 h-40 rounded-full border-4 border-indigo-500 shadow-lg overflow-hidden relative bg-slate-900 select-none cursor-move touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <img
              ref={imageRef}
              src={rawImage}
              alt="Raw Crop Target"
              onLoad={handleImageLoad}
              referrerPolicy="no-referrer"
              draggable={false}
              style={{
                width: `${drawW}px`,
                height: `${drawH}px`,
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(${zoom})`,
                transformOrigin: 'center',
                maxWidth: 'none',
                userSelect: 'none',
              }}
            />
            {/* Guide Grid overlay */}
            <div className="absolute inset-x-0 top-1/3 border-t border-white/20 pointer-events-none" />
            <div className="absolute inset-x-0 bottom-1/3 border-t border-white/20 pointer-events-none" />
            <div className="absolute inset-y-0 left-1/3 border-l border-white/20 pointer-events-none" />
            <div className="absolute inset-y-0 right-1/3 border-l border-white/20 pointer-events-none" />
          </div>
          <span className="text-[10px] text-slate-400 font-bold mt-2 flex items-center gap-1 text-center">
            <Move className="w-3 h-3 text-indigo-400" />
            원형 프레임 드래그로 조절 가능
          </span>
        </div>

        {/* Zoom adjustment slide */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
            <span>축소</span>
            <span className="text-indigo-600 font-mono">Zoom: {zoom.toFixed(2)}x</span>
            <span>확대</span>
          </div>
          <div className="flex items-center gap-3">
            <button
               type="button"
              onClick={() => setZoom((z) => Math.max(1, z - 0.1))}
              className="w-6 h-6 bg-slate-50 border border-slate-200 rounded flex items-center justify-center font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
            >
              -
            </button>
            <input
              type="range"
              min="1"
              max="4"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 accent-indigo-600 cursor-pointer h-1.5 bg-slate-100 rounded-lg appearance-none cursor-ew-resize"
            />
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(4, z + 0.1))}
              className="w-6 h-6 bg-slate-50 border border-slate-200 rounded flex items-center justify-center font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
            >
              +
            </button>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => {
              setRawImage(null);
              setOffsetX(0);
              setOffsetY(0);
              setZoom(1.2);
            }}
            className="flex-1 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            onClick={cropImage}
            className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-1"
          >
            <Check className="w-3.5 h-3.5" />
            영역 적용하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
      {/* 1. Add Input Tabs if not editing an existing member */}
      {!initialMember && (
        <div className="flex bg-slate-100 p-1.5 rounded-2xl text-xs sm:text-sm font-bold select-none gap-2">
          <button
            type="button"
            onClick={() => setInputTab('detail')}
            className={`flex-1 py-2 sm:py-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
              inputTab === 'detail'
                ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100/10'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50/50'
            }`}
          >
            <User className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-indigo-505" />
            <span>상세 등록 창</span>
          </button>
          <button
            type="button"
            onClick={() => setInputTab('simple')}
            className={`flex-1 py-2 sm:py-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
              inputTab === 'simple'
                ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100/10'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50/50'
            }`}
          >
            <Users className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-indigo-505" />
            <span>이름 일괄 등록</span>
          </button>
        </div>
      )}

      {/* Render selected content */}
      {inputTab === 'simple' && !initialMember ? (
        /* SIMPLE BATCH NAME MODE */
        <div className="space-y-5 sm:space-y-6 animate-fadeIn">
          <div>
            <label className="block text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center justify-between">
              <span>부서원 이름 입력 (일괄) *</span>
              <span className="text-indigo-600 text-[10px] sm:text-[11px] font-semibold bg-indigo-50 px-2 py-0.5 rounded">간편 대량등록</span>
            </label>
            <div className="relative">
              <textarea
                id="input-member-names-area"
                rows={5}
                required
                placeholder="예: 홍길동, 이순신, 강감찬, 유관순&#10;(줄바꿈이나 콤마, 공백 등으로 구분하여 입력하면 한 번에 모두 등록됩니다)"
                value={bulkNames}
                onChange={(e) => setBulkNames(e.target.value)}
                className="w-full text-xs sm:text-sm text-slate-705 placeholder-slate-400 bg-slate-50 border border-slate-200 rounded-xl p-3.5 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-sans leading-relaxed shadow-3xs"
              />
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 leading-normal mt-1.5">
              💡 입력하신 인원은 식별이 용이하고 유려하게 보이도록 <strong>서로 다른 다양한 프로필 사진 프리셋</strong>이 무작위로 자동 매칭되어 생성됩니다!
            </p>
          </div>

          {/* Role Input for Batch */}
          <div>
            <label className="block text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">일괄 부여할 직책 / 역할</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <Award className="w-4.5 h-4.5" />
              </span>
              <input
                id="input-member-role-simple"
                type="text"
                placeholder="부서원, 파트장, 조장 등 (공란 가능)"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all shadow-3xs"
              />
            </div>
          </div>
        </div>
      ) : (
        /* STANDARD DETAILED MODE */
        <div className="space-y-5 sm:space-y-6 animate-fadeIn">
          {/* Name Input */}
          <div>
            <label className="block text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">이름 *</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <User className="w-4.5 h-4.5" />
              </span>
              <input
                id="input-member-name"
                type="text"
                required
                placeholder="홍길동"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all shadow-3xs"
              />
            </div>
          </div>

          {/* Role Input */}
          <div>
            <label className="block text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">직책 / 역할</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <Award className="w-4.5 h-4.5" />
              </span>
              <input
                id="input-member-role"
                type="text"
                placeholder="부서원, 파트장, 조장 등"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all shadow-3xs"
              />
            </div>
          </div>

          {/* Photo Upload Zone */}
          <div>
            <label className="block text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">사진 업로드 / 프로필 선택</label>
            <div className="grid grid-cols-1 gap-3.5">
              
              {/* Drag & Drop Upload Block */}
              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={triggerFileSelect}
                className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-3 cursor-pointer transition-all duration-300 relative overflow-hidden h-24 sm:h-28 shadow-3xs ${
                  isDragActive
                    ? 'border-indigo-500 bg-indigo-50/20'
                    : photoUrl
                    ? 'border-emerald-500 bg-emerald-50/5'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={onFileChange}
                  className="hidden"
                />

                {photoUrl ? (
                  <div className="absolute inset-0 flex items-center justify-center group bg-slate-900/10">
                    <img
                      src={photoUrl}
                      alt="Preview"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <span className="text-xs text-white font-semibold">사진 변경</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <UploadCloud className="w-6 h-6 sm:w-7 sm:h-7 text-slate-400 mx-auto mb-1.5" />
                    <p className="text-xs text-slate-505 font-bold">PC 사진 가져오기</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">또는 여기에 파일 드래그</p>
                  </div>
                )}
              </div>

              {/* Presets Grid */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 justify-between border-t border-slate-100 pt-3">
                <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest shrink-0">간편 추천 아바타:</span>
                <div className="flex gap-1.5 overflow-x-auto max-w-full pb-1 py-0.5 scrollbar-thin">
                  {AVATAR_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPhotoUrl(preset)}
                      className={`relative rounded-lg overflow-hidden border transition-all p-0 h-8 w-8 sm:h-9 sm:w-9 shrink-0 ${
                        photoUrl === preset ? 'border-indigo-500 ring-2 ring-indigo-500/20 scale-105' : 'border-slate-150 hover:border-slate-350'
                      }`}
                    >
                      <img src={preset} alt={`Prs ${idx+1}`} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        id="btn-add-member"
        type="submit"
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-3 px-4 rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md hover:shadow-lg active:scale-98"
      >
        {initialMember ? <Check className="w-4 h-4 text-emerald-400" /> : <Plus className="w-4 h-4" />}
        <span>
          {initialMember
            ? '수정 완료하기'
            : inputTab === 'simple'
            ? '일괄 부서원 등록하기'
            : '부서원 등록하기'}
        </span>
      </button>
    </form>
  );
}
