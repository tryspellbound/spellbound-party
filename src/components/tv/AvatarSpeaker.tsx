import { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { LipSyncAvatar, type LipSyncAvatarHandle } from './LipSyncAvatar';
import { Box } from '@radix-ui/themes';

type AvatarSpeakerProps = {
  audioElement?: HTMLAudioElement | null;
};

export default function AvatarSpeaker({ audioElement }: AvatarSpeakerProps) {
  const avatarRef = useRef<LipSyncAvatarHandle>(null);

  return (
    <Box
      style={{
        width: '200px',
        height: '200px',
        borderRadius: '16px',
        overflow: 'hidden',
        //boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
        //border: '1px solid rgba(255, 255, 255, 0.1)',
        background: 'linear-gradient(180deg, rgba(0, 0, 0, 0.1) 0%, rgba(0, 0, 0, 0.4) 100%)',
      }}
    >
        <Canvas
          camera={{ position: [0, 0.1, 0.5], fov: 50 }}
          style={{ width: '100%', height: '100%' }}
          gl={{ alpha: true }}
        >
          {/* Enhanced lighting setup */}
          <ambientLight intensity={2} />
          <directionalLight position={[5, 5, 5]} intensity={1.5} castShadow />
          <directionalLight position={[-5, 3, -5]} intensity={0.8} />
          <pointLight position={[0, 2, 1]} intensity={1.2} />
          <pointLight position={[0, 0.5, 0.8]} intensity={0.6} color="#ffffff" />

          {/* Avatar with lip-sync */}
          <LipSyncAvatar
            ref={avatarRef}
            audioElement={audioElement}
            position={[0, -0.75, 0]}
            scale={1.2}
          />

          {/* Optional: Enable orbit controls for debugging */}
          {/* <OrbitControls enableZoom={false} /> */}
        </Canvas>
      </Box>
  );
}
