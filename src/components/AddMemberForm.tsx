/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { UploadCloud, Plus, User, Sparkles, Crop, Move, Check } from 'lucide-react';
import { Member } from '../types';

interface AddMemberFormProps {
  onAddMember: (member: Omit<Member, 'id'>) => void;
}

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=faces&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=faces&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=faces&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=faces&q=80',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=faces&q=80',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=faces&q=80',
];

export default function AddMemberForm({ onAddMember }: AddMemberFormProps) {
  const [name, setName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!name.trim()) return;

    // Use a default avatar if none chosen
    const finalPhoto = photoUrl || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=faces&q=80';

    onAddMember({
      name: name.trim(),
      role: '부서원',
      photoUrl: finalPhoto,
    });

    // Reset fields
    setName('');
    setPhotoUrl('');
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
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name Input */}
      <div>
        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">이름 *</label>
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400">
            <User className="w-3.5 h-3.5" />
          </span>
          <input
            id="input-member-name"
            type="text"
            required
            placeholder="홍길동"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-505 focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* Photo Upload Zone */}
      <div>
        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">사진 업로드 / 프로필 선택</label>
        <div className="grid grid-cols-1 gap-2">
          
          {/* Drag & Drop Upload Block */}
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={triggerFileSelect}
            className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-2 cursor-pointer transition-all duration-300 relative overflow-hidden h-20 ${
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
                  <span className="text-[10px] text-white font-semibold">사진 변경</span>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <UploadCloud className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                <p className="text-[10px] text-slate-500 font-bold">PC 사진 가져오기</p>
                <p className="text-[8px] text-slate-400 mt-0.5">또는 여기에 파일 드래그</p>
              </div>
            )}
          </div>

          {/* Presets Grid */}
          <div className="flex items-center gap-1.5 justify-between">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest shrink-0">간편 프리셋 사진:</span>
            <div className="flex gap-1">
              {AVATAR_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPhotoUrl(preset)}
                  className={`relative rounded-md overflow-hidden border transition-all p-0 h-6 w-6 shrink-0 ${
                    photoUrl === preset ? 'border-indigo-500 scale-105' : 'border-slate-100 hover:border-slate-300'
                  }`}
                >
                  <img src={preset} alt={`Prs ${idx+1}`} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Submit */}
      <button
        id="btn-add-member"
        type="submit"
        className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 px-3 rounded-lg text-xs transition-all flex items-center justify-center gap-1 cursor-pointer shadow-sm hover:shadow-md"
      >
        <Plus className="w-3.5 h-3.5" />
        부서원 등록하기
      </button>
    </form>
  );
}
