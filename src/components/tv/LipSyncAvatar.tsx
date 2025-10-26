import { useEffect, useMemo, useRef, type JSX } from "react";
import { useFrame, useGraph } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Lipsync, VISEMES } from "wawa-lipsync";
import { SkeletonUtils } from "three-stdlib";
import type { GLTF } from "three-stdlib";
import * as THREE from "three";

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

type LipSyncAvatarProps = JSX.IntrinsicElements["group"] & {
  audioElement?: HTMLAudioElement | null;
};

export function LipSyncAvatar({ audioElement, ...props }: LipSyncAvatarProps) {
  const group = useRef<THREE.Group>(null);
  const { scene, materials } = useGLTF("/avatar.glb") as unknown as GLTFResult;
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes } = useGraph(clone) as unknown as {
    nodes: GLTFResult["nodes"];
  };

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
        console.log("[LipSyncAvatar] Connected audio element to lipsync");
      } catch (error) {
        console.error(
          "[LipSyncAvatar] Failed to connect audio element:",
          error
        );
      }
    }

    return () => {
      // Don't disconnect on cleanup to avoid audio issues
      // The connection will be reused or replaced when needed
    };
  }, [audioElement, lipsyncManager]);

  // Helper to lerp morph target values across all meshes in the scene
  const lerpMorphTarget = (target: string, value: number, speed = 2) => {
    clone.traverse((child) => {
      if (child instanceof THREE.SkinnedMesh && child.morphTargetDictionary) {
        const index = child.morphTargetDictionary[target];
        if (
          index === undefined ||
          child.morphTargetInfluences === undefined ||
          child.morphTargetInfluences[index] === undefined
        ) {
          return;
        }
        child.morphTargetInfluences[index] = THREE.MathUtils.lerp(
          child.morphTargetInfluences[index],
          value,
          speed * 1.5
        );
      }
    });
  };

  // Process audio and apply visemes in render loop
  useFrame(() => {
    if (!audioElement || !connectedAudioRef.current) {
      return;
    }

    // Process audio to get current viseme (returns a string like "viseme_O")
    lipsyncManager.processAudio();
    const viseme = lipsyncManager.viseme;
    //@ts-ignore
    const state = lipsyncManager.state;

    if (!viseme) {
      return;
    }

    lerpMorphTarget(viseme, 1, state === "vowel" ? 0.2 : 0.4);

    // Lerp all other visemes to 0
    Object.values(VISEMES).forEach((visemeValue) => {
      if (viseme === visemeValue) {
        return;
      }
      lerpMorphTarget(visemeValue, 0, state === "vowel" ? 0.1 : 0.2);
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

useGLTF.preload("/avatar.glb");
