import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { LipSyncAvatar } from './LipSyncAvatar';
import { Box } from '@radix-ui/themes';

type AvatarSpeakerProps = {
  audioElement?: HTMLAudioElement | null;
};

export default function AvatarSpeaker({ audioElement }: AvatarSpeakerProps) {
  return (
    <Box
      style={{
        position: 'fixed',
        bottom: '2rem',
        right: '2rem',
        width: '280px',
        height: '280px',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        border: '2px solid var(--gray-7)',
        background: 'linear-gradient(135deg, var(--gray-2) 0%, var(--gray-3) 100%)',
        zIndex: 100,
      }}
    >
      <Canvas
        camera={{ position: [0, 0.1, 0.5], fov: 50 }}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Lighting setup */}
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} castShadow />
        <directionalLight position={[-5, 3, -5]} intensity={0.4} />
        <pointLight position={[0, 2, 1]} intensity={0.5} />

        {/* Avatar with lip-sync */}
        <LipSyncAvatar
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
