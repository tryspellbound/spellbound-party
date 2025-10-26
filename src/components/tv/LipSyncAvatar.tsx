import { useEffect, useMemo, useRef, type JSX } from 'react';
import { useFrame, useGraph } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Lipsync } from 'wawa-lipsync';
import { SkeletonUtils } from 'three-stdlib';
import type { GLTF } from 'three-stdlib';
import * as THREE from 'three';

type GLTFResult = GLTF & {
  nodes: {
    Wolf3D_Hands: THREE.SkinnedMesh;
    Wolf3D_Hair: THREE.SkinnedMesh;
    Wolf3D_Shirt: THREE.SkinnedMesh;
    EyeLeft: THREE.SkinnedMesh;
    EyeRight: THREE.SkinnedMesh;
    Wolf3D_Head: THREE.SkinnedMesh;
    Wolf3D_Teeth: THREE.SkinnedMesh;
    Hips: THREE.Bone;
  };
  materials: {
    Wolf3D_Skin: THREE.MeshStandardMaterial;
    Wolf3D_Hair: THREE.MeshStandardMaterial;
    Wolf3D_Shirt: THREE.MeshStandardMaterial;
    Wolf3D_Eye: THREE.MeshStandardMaterial;
    Wolf3D_Teeth: THREE.MeshStandardMaterial;
  };
};

type LipSyncAvatarProps = JSX.IntrinsicElements['group'] & {
  audioElement?: HTMLAudioElement | null;
};

export function LipSyncAvatar({ audioElement, ...props }: LipSyncAvatarProps) {
  const group = useRef<THREE.Group>(null);
  const { scene, materials } = useGLTF('/avatar.glb') as unknown as GLTFResult;
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes } = useGraph(clone) as unknown as { nodes: GLTFResult['nodes'] };

  // Create a single Lipsync instance
  const lipsyncManager = useMemo(() => new Lipsync(), []);
  const connectedAudioRef = useRef<HTMLAudioElement | null>(null);

  // Connect audio element to lip-sync analyzer
  useEffect(() => {
    if (!audioElement) {
      return;
    }

    // Only connect if it's a different audio element or hasn't been connected yet
    if (connectedAudioRef.current !== audioElement) {
      try {
        lipsyncManager.connectAudio(audioElement);
        connectedAudioRef.current = audioElement;
        console.log('[LipSyncAvatar] Connected audio element to lipsync');
      } catch (error) {
        console.error('[LipSyncAvatar] Failed to connect audio element:', error);
      }
    }

    return () => {
      // Don't disconnect on cleanup to avoid audio issues
      // The connection will be reused or replaced when needed
    };
  }, [audioElement, lipsyncManager]);

  // Process audio and apply visemes to head and teeth meshes in render loop
  useFrame(() => {
    if (!audioElement || !connectedAudioRef.current) {
      return;
    }

    // Process audio to get current viseme data
    lipsyncManager.processAudio();
    const viseme = lipsyncManager.viseme;

    if (!viseme) {
      return;
    }

    const head = nodes.Wolf3D_Head;
    const teeth = nodes.Wolf3D_Teeth;

    // Reset all morph target influences to 0
    if (head.morphTargetInfluences) {
      for (let i = 0; i < head.morphTargetInfluences.length; i++) {
        head.morphTargetInfluences[i] = 0;
      }
    }

    if (teeth.morphTargetInfluences) {
      for (let i = 0; i < teeth.morphTargetInfluences.length; i++) {
        teeth.morphTargetInfluences[i] = 0;
      }
    }
    console.log("viseme", viseme);
    console.log("head.morphTargetDictionary", head.morphTargetDictionary);
    console.log("head.morphTargetInfluences", head.morphTargetInfluences);
    console.log("teeth.morphTargetDictionary", teeth.morphTargetDictionary);
    console.log("teeth.morphTargetInfluences", teeth.morphTargetInfluences);

    // Apply new viseme influences
    Object.entries(viseme).forEach(([visemeName, value]) => {
      const numericValue = typeof value === 'number' ? value : 0;

      // Apply to head
      if (head.morphTargetDictionary && head.morphTargetInfluences) {
        const headIndex = head.morphTargetDictionary[visemeName];
        if (headIndex !== undefined) {
          head.morphTargetInfluences[headIndex] = numericValue;
        }
      }

      // Apply to teeth
      if (teeth.morphTargetDictionary && teeth.morphTargetInfluences) {
        const teethIndex = teeth.morphTargetDictionary[visemeName];
        if (teethIndex !== undefined) {
          teeth.morphTargetInfluences[teethIndex] = numericValue;
        }
      }
    });
  });

  return (
    <group ref={group} {...props} dispose={null}>
      <group name="Scene">
        <group name="AvatarRoot">
          <primitive object={nodes.Hips} />
          <skinnedMesh
            name="Wolf3D_Hands"
            geometry={nodes.Wolf3D_Hands.geometry}
            material={materials.Wolf3D_Skin}
            skeleton={nodes.Wolf3D_Hands.skeleton}
          />
          <skinnedMesh
            name="Wolf3D_Hair"
            geometry={nodes.Wolf3D_Hair.geometry}
            material={materials.Wolf3D_Hair}
            skeleton={nodes.Wolf3D_Hair.skeleton}
          />
          <skinnedMesh
            name="Wolf3D_Shirt"
            geometry={nodes.Wolf3D_Shirt.geometry}
            material={materials.Wolf3D_Shirt}
            skeleton={nodes.Wolf3D_Shirt.skeleton}
          />
          <skinnedMesh
            name="EyeLeft"
            geometry={nodes.EyeLeft.geometry}
            material={materials.Wolf3D_Eye}
            skeleton={nodes.EyeLeft.skeleton}
            morphTargetDictionary={nodes.EyeLeft.morphTargetDictionary}
            morphTargetInfluences={nodes.EyeLeft.morphTargetInfluences}
          />
          <skinnedMesh
            name="EyeRight"
            geometry={nodes.EyeRight.geometry}
            material={materials.Wolf3D_Eye}
            skeleton={nodes.EyeRight.skeleton}
            morphTargetDictionary={nodes.EyeRight.morphTargetDictionary}
            morphTargetInfluences={nodes.EyeRight.morphTargetInfluences}
          />
          <skinnedMesh
            name="Wolf3D_Head"
            geometry={nodes.Wolf3D_Head.geometry}
            material={materials.Wolf3D_Skin}
            skeleton={nodes.Wolf3D_Head.skeleton}
            morphTargetDictionary={nodes.Wolf3D_Head.morphTargetDictionary}
            morphTargetInfluences={nodes.Wolf3D_Head.morphTargetInfluences}
          />
          <skinnedMesh
            name="Wolf3D_Teeth"
            geometry={nodes.Wolf3D_Teeth.geometry}
            material={materials.Wolf3D_Teeth}
            skeleton={nodes.Wolf3D_Teeth.skeleton}
            morphTargetDictionary={nodes.Wolf3D_Teeth.morphTargetDictionary}
            morphTargetInfluences={nodes.Wolf3D_Teeth.morphTargetInfluences}
          />
        </group>
      </group>
    </group>
  );
}

useGLTF.preload('/avatar.glb');
