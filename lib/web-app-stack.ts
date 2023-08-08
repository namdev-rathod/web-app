import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Vpc, SubnetType, InstanceType, MachineImage, SecurityGroup, Port, InstanceClass, InstanceSize } from 'aws-cdk-lib/aws-ec2';
import { Schedule } from 'aws-cdk-lib/aws-applicationautoscaling';
import { ApplicationLoadBalancer, ApplicationProtocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import {readFileSync} from 'fs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';


export class WebAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get existing VPC
    // const vpc = ec2.Vpc.fromLookup(this, 'VPC', {
    //   vpcId: props.VpcId
    // })

        // Create a new VPC with two public subnets (one in each AZ) and CIDR 10.0.0.0/16
        const vpc = new Vpc(this, 'MyVpc', {
          maxAzs: 2,
          subnetConfiguration: [
            {
              name: 'Public',
              subnetType: SubnetType.PUBLIC,
            },
          ],
        });

        // Create VPC and two public subnets in different availability zones
        // const vpc = new ec2.Vpc(this, 'MyVPC', {
        //   cidr: '10.0.0.0/16',
        //   maxAzs: 2,
        //   subnetConfiguration: [
        //     {
        //       cidrMask: 24,
        //       name: 'public-subnet-1',
        //       subnetType: ec2.SubnetType.PUBLIC,
        //     },
        //     {
        //       cidrMask: 24,
        //       name: 'public-subnet-2',
        //       subnetType: ec2.SubnetType.PUBLIC,
        //     },
        //   ],
        // });

    //  create Security Group for the Instance
    const webserverSG = new ec2.SecurityGroup(this, 'webserver-sg', {
      securityGroupName: ('web-server-poc-sg'),
      vpc,
      allowAllOutbound: true,
    });

    webserverSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'allow SSH access from anywhere',
    );

    webserverSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'allow HTTP traffic from anywhere',
    );

    webserverSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'allow HTTPS traffic from anywhere',
    );

    webserverSG.addIngressRule(
      ec2.Peer.ipv4("192.168.10.10/32"),
      ec2.Port.tcp(3309),
      'allow RDP traffic from anywhere',
    );

    // Create EBS volume with custom size
    const rootVolume: ec2.BlockDevice = {
      deviceName: '/dev/xvda', // Use the root device name from Step 1
      volume: ec2.BlockDeviceVolume.ebs(15), // Override the volume size in Gibibytes (GiB)
    };


    // Create EC2 instances in different availability zones
        const ec2Instance1 = new ec2.Instance(this, 'EC2Instance1', {
          instanceName: ('web-server-poc-1'),
          blockDevices: [rootVolume],
          vpc,
          instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
          machineImage: new ec2.AmazonLinux2023ImageSsmParameter({
         kernel: ec2.AmazonLinux2023Kernel.KERNEL_6_1,
       }),
          keyName: 'my-first-ec2',
          vpcSubnets: {
            subnetType: ec2.SubnetType.PUBLIC, // Choose the appropriate subnet type
            availabilityZones: ['ap-south-1a'], // Specify the desired availability zone
          },
          securityGroup: webserverSG,
        });

    // Second Server    
        const ec2Instance2 = new ec2.Instance(this, 'EC2Instance2', {
          instanceName: ('web-server-poc-2'),
          blockDevices: [rootVolume],
          vpc,
          instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
          machineImage: new ec2.AmazonLinux2023ImageSsmParameter({
            kernel: ec2.AmazonLinux2023Kernel.KERNEL_6_1,
          }),
          keyName: 'my-first-ec2',
          vpcSubnets: {
            subnetType: ec2.SubnetType.PUBLIC, // Choose the appropriate subnet type
            availabilityZones: ['ap-south-1b'], // Specify the desired availability zone
          },
          securityGroup: webserverSG,
        });

    // load contents of script
    const userDataScript1 = readFileSync('./lib/user-data1.sh', 'utf8');
    const userDataScript2 = readFileSync('./lib/user-data2.sh', 'utf8');
    // add the User Data script to the Instance
    ec2Instance1.addUserData(userDataScript1);
    ec2Instance2.addUserData(userDataScript2);

    // Create an Application Load Balancer
    const alb = new ApplicationLoadBalancer(this, 'webapplb', {
      loadBalancerName: 'webapp-alb',
      vpc,
      internetFacing: true,
      securityGroup: webserverSG,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC, // Choose the appropriate subnet type
        availabilityZones: ['ap-south-1a', 'ap-south-1b'], // Specify the desired availability zone
      },
    });


   // Create a target group for the instances
        const targetGroup = new cdk.aws_elasticloadbalancingv2.ApplicationTargetGroup(this, 'InstanceTargetGroup', {
          port: 80,
          vpc,
          targetType: elbv2.TargetType.INSTANCE,
          healthCheck: {
            path: '/',
            protocol: elbv2.Protocol.HTTP,
          },
        });

    // Add SSL certificate ARN from ACM
          const certificateArn = 'arn:aws:acm:ap-south-1:666930281169:certificate/61427c62-07d7-45c8-b46f-c5fbac653c4a';
          const listener = alb.addListener('HTTPSListener', {
            port: 443,
            protocol: elbv2.ApplicationProtocol.HTTPS,
            defaultTargetGroups: [targetGroup],
            certificates: [elbv2.ListenerCertificate.fromArn(certificateArn)],
          });

    // Attach the target group to the ALB listener
    //       listener.addTargets(
    //         'InstanceTarget',
    //             {
    //       port: 80,
    //       targets: [instance2],
    // });

  }
}
